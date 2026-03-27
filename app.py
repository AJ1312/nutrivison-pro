import base64
import json
import os
import re
from datetime import datetime
from functools import wraps

import google.generativeai as genai
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from flask import (
    Flask,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
    flash,
)
from PIL import Image
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "fallback-secret-key-for-development")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MONGODB_URI = os.getenv("MONGODB_URI")
DATABASE_NAME = os.getenv("DATABASE_NAME", "food_analyzer")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "food_items")
USER_COLLECTION_NAME = os.getenv("USER_COLLECTION_NAME", "users")

startup_issues = []

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    startup_issues.append("GEMINI_API_KEY is missing")

mongo_client = None
db = None
food_collection = None
users_collection = None

if MONGODB_URI:
    try:
        mongo_client = MongoClient(MONGODB_URI)
        db = mongo_client[DATABASE_NAME]
        food_collection = db[COLLECTION_NAME]
        users_collection = db[USER_COLLECTION_NAME]
        users_collection.create_index(
            [("email", 1)],
            unique=True,
            name="unique_email_not_null",
            partialFilterExpression={"email": {"$type": "string"}},
        )
        # Create indexes for food_collection to optimize history queries
        food_collection.create_index(
            [("user_id", 1), ("timestamp", -1)],
            name="user_id_timestamp_desc"
        )
        print("[SUCCESS] MongoDB connected successfully!")
    except Exception as error:
        startup_issues.append(f"MongoDB connection error: {error}")
        print(f"[ERROR] MongoDB connection error: {error}")
else:
    startup_issues.append("MONGODB_URI is missing")

if startup_issues:
    print("[WARN] Startup issues detected:")
    for issue in startup_issues:
        print(f"[WARN] - {issue}")

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "bmp", "webp"}
MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 16777216))

app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH


def login_required(api=False):
    def decorator(func):
        @wraps(func)
        def wrapped(*args, **kwargs):
            if "user_id" not in session:
                if api:
                    return jsonify({"success": False, "error": "Authentication required"}), 401
                flash("Please login to continue.", "warning")
                return redirect(url_for("login", next=request.path))
            return func(*args, **kwargs)

        return wrapped

    return decorator


def current_user_context():
    return {
        "user_id": session.get("user_id"),
        "user_name": session.get("user_name"),
        "user_email": session.get("user_email"),
    }


def safe_next_url(next_url):
    if next_url and next_url.startswith("/"):
        return next_url
    return url_for("dashboard")


def generate_unique_username(email):
    base = re.sub(r"[^a-z0-9_]", "", email.split("@")[0].lower()) or "user"
    candidate = base
    suffix = 1

    while users_collection.find_one({"username": candidate}):
        suffix += 1
        candidate = f"{base}{suffix}"

    return candidate


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def image_to_base64(image_file):
    try:
        image_data = image_file.read()
        image_file.seek(0)
        return base64.b64encode(image_data).decode("utf-8")
    except Exception as error:
        print(f"[ERROR] Error converting image to base64: {error}")
        return None


def format_timestamp(timestamp_value):
    if isinstance(timestamp_value, datetime):
        return timestamp_value.strftime("%Y-%m-%d %H:%M:%S")

    if isinstance(timestamp_value, str):
        normalized = timestamp_value.strip()
        if not normalized:
            return "Unknown time"

        try:
            parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
            return parsed.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            return normalized

    return "Unknown time"


def build_image_preview(image_base64):
    if not isinstance(image_base64, str) or not image_base64.strip():
        return None

    if image_base64.startswith("data:image/"):
        return image_base64

    return f"data:image/jpeg;base64,{image_base64}"


def serialize_analysis_document(analysis):
    serialized = dict(analysis)
    serialized["_id"] = str(serialized.get("_id", ""))
    serialized["timestamp"] = format_timestamp(serialized.get("timestamp"))

    image_preview = build_image_preview(serialized.get("image_base64"))
    if image_preview:
        serialized["image_preview"] = image_preview

    return serialized


def extract_json_from_response(response_text):
    """Extract JSON from Gemini response with multiple fallback methods."""
    # Method 1: JSON code block
    json_pattern = r"```json\s*(.*?)\s*```"
    match = re.search(json_pattern, response_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Method 2: Any fenced code block
    code_pattern = r"```\s*(.*?)\s*```"
    match = re.search(code_pattern, response_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Method 3: First object-like block
    json_start = response_text.find("{")
    json_end = response_text.rfind("}")
    if json_start != -1 and json_end != -1 and json_end > json_start:
        try:
            return json.loads(response_text[json_start : json_end + 1])
        except json.JSONDecodeError:
            pass

    # Method 4: Entire response
    try:
        return json.loads(response_text.strip())
    except json.JSONDecodeError:
        return None


def generate_json_with_gemini(prompt):
    model = genai.GenerativeModel("gemini-2.5-flash")
    response = model.generate_content(prompt)
    response_text = (response.text or "").strip()
    parsed = extract_json_from_response(response_text)
    return parsed, response_text


def get_nearby_places(food_name, latitude, longitude):
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")

        prompt = f"""
        Based on the food item "{food_name}" and the location coordinates (latitude: {latitude}, longitude: {longitude}),
        suggest 4-5 nearby places (shops, restaurants, hotels, cafes, or markets) where this food item is commonly available.

        Provide ONLY a JSON response in this exact format:
        {{
            "nearby_places": [
                {{
                    "name": "Place name",
                    "type": "Restaurant/Cafe/Shop/Hotel/Market",
                    "description": "Brief description of what they offer",
                    "distance": "Approximate distance estimate"
                }}
            ]
        }}

        Make educated suggestions based on common establishments that typically serve or sell this type of food.
        If this is a common food item, suggest generic place types.
        """

        response = model.generate_content(prompt)
        response_text = response.text.strip()
        places_data = extract_json_from_response(response_text)

        if places_data and "nearby_places" in places_data:
            return places_data["nearby_places"]

        return [
            {
                "name": f"Local {food_name} Vendors",
                "type": "Market/Shop",
                "description": f"Check nearby markets and grocery stores for {food_name}",
                "distance": "Nearby",
            }
        ]

    except Exception as error:
        print(f"[ERROR] Error getting nearby places: {error}")
        return []


def create_meal_plan_with_gemini(profile):
    fallback = {
        "summary": {
            "daily_calories": profile.get("calorie_target") or "N/A",
            "goal": profile.get("goal", "General health"),
            "diet_type": profile.get("diet_type", "Balanced"),
        },
        "meal_plan": [],
        "tips": ["Unable to generate AI meal plan at the moment. Please try again."],
    }

    try:
        prompt = f"""
        Create a 1-day meal plan using this profile:
        - Goal: {profile.get("goal")}
        - Diet type: {profile.get("diet_type")}
        - Allergies: {profile.get("allergies")}
        - Preferred cuisines: {profile.get("cuisines")}
        - Meals per day: {profile.get("meals_per_day")}
        - Daily calorie target: {profile.get("calorie_target")}

        Return ONLY valid JSON in this format:
        {{
          "summary": {{
            "daily_calories": "number",
            "goal": "text",
            "diet_type": "text"
          }},
          "meal_plan": [
            {{
              "meal_name": "Breakfast/Lunch/Dinner/Snack",
              "total_calories": "number",
              "items": [
                {{
                  "name": "Food name",
                  "portion": "portion size",
                  "calories": "number"
                }}
              ]
            }}
          ],
          "tips": ["3 to 6 practical nutrition tips"]
        }}
        """

        data, _ = generate_json_with_gemini(prompt)
        if data and isinstance(data, dict):
            return data
        return fallback
    except Exception as error:
        print(f"[ERROR] Meal planner failed: {error}")
        return fallback


def get_food_metrics_with_gemini(food_name, serving_size):
    fallback = {
        "food_name": food_name,
        "serving_size_g": serving_size or "100",
        "calories_per_100g": "N/A",
        "macros": {"protein_g": "N/A", "carbs_g": "N/A", "fat_g": "N/A", "fiber_g": "N/A"},
        "micros": {"sodium_mg": "N/A", "potassium_mg": "N/A", "iron_mg": "N/A"},
        "glycemic_index": "N/A",
        "health_notes": ["Unable to fetch metrics right now."],
        "healthier_alternatives": [],
    }

    try:
        prompt = f"""
        Provide nutrition metrics for this food:
        - Food name: {food_name}
        - Serving size (grams): {serving_size or '100'}

        Return ONLY valid JSON:
        {{
          "food_name": "text",
          "serving_size_g": "number",
          "calories_per_100g": "number",
          "macros": {{
            "protein_g": "number",
            "carbs_g": "number",
            "fat_g": "number",
            "fiber_g": "number"
          }},
          "micros": {{
            "sodium_mg": "number",
            "potassium_mg": "number",
            "iron_mg": "number"
          }},
          "glycemic_index": "Low/Medium/High",
          "health_notes": ["3 to 5 concise points"],
          "healthier_alternatives": ["2 to 4 alternatives"]
        }}
        """

        data, _ = generate_json_with_gemini(prompt)
        if data and isinstance(data, dict):
            return data
        return fallback
    except Exception as error:
        print(f"[ERROR] Food search failed: {error}")
        return fallback


def get_nutrition_assistant_response(question, goal, dietary_context):
    fallback = {
        "answer": "I could not generate a reliable nutrition answer right now.",
        "key_points": ["Please retry with a more specific question."],
        "caution": "This guidance is educational and not a medical diagnosis.",
    }

    try:
        prompt = f"""
        You are a practical nutrition coach.
        Question: {question}
        User goal: {goal}
        Dietary context/allergies: {dietary_context}

        Return ONLY valid JSON:
        {{
          "answer": "2-5 sentence answer",
          "key_points": ["3 to 6 bullet points"],
          "caution": "short safety note"
        }}
        """

        data, _ = generate_json_with_gemini(prompt)
        if data and isinstance(data, dict):
            return data
        return fallback
    except Exception as error:
        print(f"[ERROR] Nutrition assistant failed: {error}")
        return fallback


def analyze_food_with_gemini(image_file):
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        img = Image.open(image_file)

        prompt = """
        Analyze this food image and provide detailed nutritional information in the following JSON format ONLY.
        Do not include any text before or after the JSON:

        {
            "food_name": "Name of the food item",
            "category": "Food category (e.g., Fruit, Vegetable, Grain, Protein, Dairy, etc.)",
            "calories_per_100g": "Estimated calories per 100 grams (number only)",
            "nutritional_info": {
                "protein": "Protein content in grams per 100g (number only)",
                "carbohydrates": "Carbohydrate content in grams per 100g (number only)",
                "fat": "Fat content in grams per 100g (number only)",
                "fiber": "Fiber content in grams per 100g (number only)",
                "sugar": "Sugar content in grams per 100g (number only)",
                "sodium": "Sodium content in mg per 100g (number only)"
            },
            "vitamins_minerals": {
                "vitamin_c": "Vitamin C content with units",
                "vitamin_a": "Vitamin A content with units",
                "iron": "Iron content with units",
                "calcium": "Calcium content with units",
                "potassium": "Potassium content with units"
            },
            "health_benefits": ["List of 3-5 key health benefits"],
            "allergens": ["List of potential allergens if any"],
            "storage_tips": "Brief storage recommendation",
            "preparation_suggestions": ["List of 2-3 preparation methods"],
            "serving_size": "Standard serving size",
            "glycemic_index": "Low/Medium/High",
            "dietary_restrictions": ["Applicable dietary categories like Vegan, Vegetarian, Gluten-free, etc."]
        }

        If you cannot identify the food clearly, set food_name to "Unidentified food item".
        """

        response = model.generate_content([prompt, img])
        response_text = response.text.strip()
        food_data = extract_json_from_response(response_text)

        if food_data:
            return food_data

        return {
            "food_name": "Unable to identify food item",
            "category": "Unknown",
            "calories_per_100g": "N/A",
            "nutritional_info": {
                "protein": "N/A",
                "carbohydrates": "N/A",
                "fat": "N/A",
                "fiber": "N/A",
                "sugar": "N/A",
                "sodium": "N/A",
            },
            "vitamins_minerals": {
                "vitamin_c": "N/A",
                "vitamin_a": "N/A",
                "iron": "N/A",
                "calcium": "N/A",
                "potassium": "N/A",
            },
            "health_benefits": ["Analysis could not be completed"],
            "allergens": [],
            "storage_tips": "Store according to food type",
            "preparation_suggestions": ["Cook as desired"],
            "serving_size": "N/A",
            "glycemic_index": "N/A",
            "dietary_restrictions": [],
            "raw_response": response_text,
            "parsing_error": True,
        }

    except Exception as error:
        print(f"[ERROR] Error analyzing food with Gemini: {error}")
        return {
            "error": f"Failed to analyze food: {str(error)}",
            "food_name": "Analysis Failed",
            "category": "Unknown",
            "calories_per_100g": "N/A",
            "nutritional_info": {
                "protein": "N/A",
                "carbohydrates": "N/A",
                "fat": "N/A",
                "fiber": "N/A",
                "sugar": "N/A",
                "sodium": "N/A",
            },
            "vitamins_minerals": {},
            "health_benefits": [],
            "allergens": [],
            "storage_tips": "N/A",
            "preparation_suggestions": [],
            "serving_size": "N/A",
            "glycemic_index": "N/A",
            "dietary_restrictions": [],
        }


def save_to_mongodb(food_data, image_base64, original_filename, location_data=None):
    try:
        document = {
            "timestamp": datetime.utcnow(),
            "original_filename": original_filename,
            "image_base64": image_base64,
            "food_data": food_data,
            "analysis_date": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
            "user_id": session.get("user_id"),
            "user_email": session.get("user_email"),
            "location_data": location_data,
            "user_agent": request.user_agent.string,
        }

        result = food_collection.insert_one(document)
        print(f"[SUCCESS] Document saved to MongoDB with ID: {result.inserted_id}")
        return str(result.inserted_id)
    except Exception as error:
        print(f"[ERROR] Error saving to MongoDB: {error}")
        return None


@app.context_processor
def inject_user():
    return {"current_user": current_user_context()}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/dashboard")
@login_required()
def dashboard():
    return render_template("dashboard.html")


@app.route("/history")
@login_required()
def history_page():
    return render_template("history.html")


@app.route("/meal-planner")
@login_required()
def meal_planner_page():
    return render_template("meal_planner.html")


@app.route("/food-search")
@login_required()
def food_search_page():
    return render_template("food_search.html")


@app.route("/nutrition-assistant")
@login_required()
def nutrition_assistant_page():
    return render_template("nutrition_assistant.html")


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if session.get("user_id"):
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        username = generate_unique_username(email) if email else ""

        if len(name) < 2:
            flash("Name must be at least 2 characters.", "error")
            return render_template("signup.html")
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            flash("Please enter a valid email address.", "error")
            return render_template("signup.html")
        if len(password) < 8:
            flash("Password must be at least 8 characters.", "error")
            return render_template("signup.html")

        user_document = {
            "name": name,
            "username": username,
            "email": email,
            "password_hash": generate_password_hash(password),
            "created_at": datetime.utcnow(),
            "last_login": datetime.utcnow(),
        }

        try:
            result = users_collection.insert_one(user_document)
        except DuplicateKeyError:
            flash("An account with this email already exists.", "error")
            return render_template("signup.html")
        except Exception as error:
            flash(f"Signup failed: {error}", "error")
            return render_template("signup.html")

        session["user_id"] = str(result.inserted_id)
        session["user_name"] = name
        session["user_email"] = email
        flash("Welcome to NutriVision Pro!", "success")
        return redirect(url_for("dashboard"))

    return render_template("signup.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("user_id"):
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        user = users_collection.find_one({"email": email})
        if not user or not check_password_hash(user.get("password_hash", ""), password):
            flash("Invalid email or password.", "error")
            return render_template("login.html")

        users_collection.update_one(
            {"_id": user["_id"]},
            {"$set": {"last_login": datetime.utcnow()}},
        )

        session["user_id"] = str(user["_id"])
        session["user_name"] = user.get("name", "User")
        session["user_email"] = user.get("email")

        next_url = safe_next_url(request.args.get("next"))
        flash("Welcome back!", "success")
        return redirect(next_url)

    return render_template("login.html")


@app.route("/api/meal-planner", methods=["POST"])
@login_required(api=True)
def meal_planner_api():
    payload = request.get_json(silent=True) or {}
    profile = {
        "goal": (payload.get("goal") or "General wellness").strip(),
        "diet_type": (payload.get("diet_type") or "Balanced").strip(),
        "allergies": (payload.get("allergies") or "None").strip(),
        "cuisines": (payload.get("cuisines") or "Any").strip(),
        "meals_per_day": str(payload.get("meals_per_day") or "4").strip(),
        "calorie_target": str(payload.get("calorie_target") or "2000").strip(),
    }
    plan = create_meal_plan_with_gemini(profile)
    return jsonify({"success": True, "plan": plan})


@app.route("/api/food-search", methods=["POST"])
@login_required(api=True)
def food_search_api():
    payload = request.get_json(silent=True) or {}
    food_name = (payload.get("food_name") or "").strip()
    serving_size = str(payload.get("serving_size") or "100").strip()

    if not food_name:
        return jsonify({"success": False, "error": "Food name is required"}), 400

    metrics = get_food_metrics_with_gemini(food_name, serving_size)
    return jsonify({"success": True, "metrics": metrics})


@app.route("/api/nutrition-assistant", methods=["POST"])
@login_required(api=True)
def nutrition_assistant_api():
    payload = request.get_json(silent=True) or {}
    question = (payload.get("question") or "").strip()
    goal = (payload.get("goal") or "General health").strip()
    dietary_context = (payload.get("dietary_context") or "No special restrictions").strip()

    if not question:
        return jsonify({"success": False, "error": "Question is required"}), 400

    answer = get_nutrition_assistant_response(question, goal, dietary_context)
    return jsonify({"success": True, "assistant": answer})


@app.route("/logout", methods=["POST"])
@login_required()
def logout():
    session.clear()
    flash("You have been logged out.", "success")
    return redirect(url_for("login"))


@app.route("/upload", methods=["POST"])
@login_required(api=True)
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file selected", "success": False}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected", "success": False}), 400

    if not (file and allowed_file(file.filename)):
        return (
            jsonify(
                {
                    "error": "Invalid file type. Please upload JPG, PNG, GIF, BMP, or WebP files.",
                    "success": False,
                }
            ),
            400,
        )

    try:
        original_filename = secure_filename(file.filename)

        location_data = None
        if request.form.get("latitude") and request.form.get("longitude"):
            location_data = {
                "latitude": float(request.form.get("latitude")),
                "longitude": float(request.form.get("longitude")),
            }

        image_base64 = image_to_base64(file)
        if not image_base64:
            return jsonify({"error": "Failed to process image", "success": False}), 500

        file.seek(0)
        print(f"[INFO] Analyzing image: {original_filename}")
        food_data = analyze_food_with_gemini(file)

        nearby_places = []
        if location_data and food_data.get("food_name"):
            print(f"[INFO] Getting nearby places for {food_data['food_name']}")
            nearby_places = get_nearby_places(
                food_data["food_name"],
                location_data["latitude"],
                location_data["longitude"],
            )

        food_data["nearby_places"] = nearby_places

        mongo_id = save_to_mongodb(food_data, image_base64, original_filename, location_data)
        if mongo_id:
            food_data["mongo_id"] = mongo_id

        return jsonify(
            {
                "success": True,
                "food_data": food_data,
                "image_base64": f"data:image/jpeg;base64,{image_base64}",
                "original_filename": original_filename,
            }
        )
    except Exception as error:
        print(f"[ERROR] Error processing file: {error}")
        return jsonify({"error": f"Error processing file: {str(error)}", "success": False}), 500


@app.route("/api/history")
@login_required(api=True)
def history_api():
    try:
        page = request.args.get("page", 1, type=int)
        limit = request.args.get("limit", 20, type=int)
        limit = min(limit, 50)  # Cap at 50 items per page
        skip = (page - 1) * limit

        # Use projection to exclude large image_base64 field for list view
        # Only include necessary fields for the history grid
        analyses = list(
            food_collection.find(
                {"user_id": session.get("user_id")},
                {
                    "_id": 1,
                    "timestamp": 1,
                    "original_filename": 1,
                    "food_data.food_name": 1,
                    "food_data.category": 1,
                    "food_data.calories_per_100g": 1,
                    "image_base64": 1  # Keep for preview generation
                }
            )
            .sort("timestamp", -1)
            .skip(skip)
            .limit(limit)
        )

        # Get total count for pagination
        total_count = food_collection.count_documents({"user_id": session.get("user_id")})

        safe_analyses = [serialize_analysis_document(analysis) for analysis in analyses]
        return jsonify({
            "success": True,
            "analyses": safe_analyses,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total_count,
                "has_more": skip + limit < total_count
            }
        })
    except Exception as error:
        print(f"[ERROR] Error fetching history: {error}")
        return jsonify({"error": f"Error fetching history: {str(error)}", "success": False}), 500


@app.route("/analysis/<analysis_id>")
@login_required(api=True)
def get_analysis(analysis_id):
    try:
        object_id = ObjectId(analysis_id)
    except InvalidId:
        return jsonify({"error": "Invalid analysis id", "success": False}), 400

    try:
        analysis = food_collection.find_one(
            {"_id": object_id, "user_id": session.get("user_id")}
        )

        if not analysis:
            return jsonify({"error": "Analysis not found", "success": False}), 404

        return jsonify({"success": True, "analysis": serialize_analysis_document(analysis)})
    except Exception as error:
        print(f"[ERROR] Error fetching analysis: {error}")
        return jsonify({"error": f"Error fetching analysis: {str(error)}", "success": False}), 500


@app.route("/delete/<analysis_id>", methods=["DELETE"])
@login_required(api=True)
def delete_analysis(analysis_id):
    try:
        object_id = ObjectId(analysis_id)
    except InvalidId:
        return jsonify({"error": "Invalid analysis id", "success": False}), 400

    try:
        result = food_collection.delete_one(
            {"_id": object_id, "user_id": session.get("user_id")}
        )

        if result.deleted_count > 0:
            return jsonify({"success": True, "message": "Analysis deleted successfully"})

        return jsonify({"error": "Analysis not found", "success": False}), 404
    except Exception as error:
        print(f"[ERROR] Error deleting analysis: {error}")
        return jsonify({"error": f"Error deleting analysis: {str(error)}", "success": False}), 500


@app.errorhandler(404)
def page_not_found(error):
    return render_template("404.html"), 404


@app.errorhandler(413)
def too_large(error):
    return jsonify({"error": "File too large. Maximum size is 16MB.", "success": False}), 413


if __name__ == "__main__":
    print("[INFO] Starting Food Analyzer Application...")

    debug_mode = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", 5000))

    print(f"[INFO] Access the app at: http://{host}:{port}")
    app.run(debug=debug_mode, host=host, port=port)
