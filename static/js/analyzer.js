const fileInput = document.getElementById("fileInput");
const chooseFileBtn = document.getElementById("chooseFileBtn");
const uploadArea = document.getElementById("uploadArea");
const fileInfo = document.getElementById("fileInfo");
const loading = document.getElementById("loading");
const progressFill = document.getElementById("progressFill");
const loadingText = document.getElementById("loadingText");
const resultTitle = document.getElementById("resultTitle");
const resultSubtitle = document.getElementById("resultSubtitle");
const resultGrid = document.getElementById("resultGrid");
const foodImage = document.getElementById("foodImage");
const resetBtn = document.getElementById("resetBtn");
const locationStatus = document.getElementById("locationStatus");
const messageBox = document.getElementById("messageBox");

let userLocation = null;

const loadingMessages = [
    "Analyzing nutritional profile...",
    "Identifying food category...",
    "Estimating micronutrient data...",
    "Preparing your final report..."
];

function setLocationStatus(ok) {
    if (ok) {
        locationStatus.innerHTML =
            '<span class="location-chip ok"><i class="fa-solid fa-location-dot"></i> Location enabled for nearby place suggestions</span>';
    } else {
        locationStatus.innerHTML =
            '<span class="location-chip warn"><i class="fa-solid fa-triangle-exclamation"></i> Location blocked. Nearby place suggestions may be limited</span>';
    }
}

function initLocation() {
    if (!("geolocation" in navigator)) {
        setLocationStatus(false);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            userLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };
            setLocationStatus(true);
        },
        () => setLocationStatus(false)
    );
}

function showMessage(text, type = "error") {
    messageBox.innerHTML = '<div class="message ' + type + '">' + text + "</div>";
    setTimeout(() => {
        messageBox.innerHTML = "";
    }, 4500);
}

function setLoading(isLoading) {
    loading.style.display = isLoading ? "block" : "none";
}

function simulateProgress() {
    let progress = 0;
    let idx = 0;

    const interval = setInterval(() => {
        progress = Math.min(progress + Math.random() * 18, 92);
        progressFill.style.width = progress + "%";
        loadingText.textContent = loadingMessages[idx % loadingMessages.length];
        idx += 1;
    }, 520);

    return interval;
}

function formatList(items, fallback = "N/A") {
    if (Array.isArray(items) === false || items.length === 0) {
        return "<p>" + fallback + "</p>";
    }

    const list = items.map((item) => "<li>" + item + "</li>").join("");
    return '<ul class="list">' + list + "</ul>";
}

function infoCard(title, body) {
    return '<article class="result-card"><h3>' + title + "</h3>" + body + "</article>";
}

function renderPlaces(places) {
    if (Array.isArray(places) === false || places.length === 0) {
        return "<p>No nearby suggestions available.</p>";
    }

    return places
        .map((place) => {
            const name = place.name || "Unknown place";
            const type = place.type || "Place";
            const distance = place.distance || "Distance unavailable";
            const description = place.description || "";
            return (
                '<div class="place">' +
                "<strong>" +
                name +
                "</strong>" +
                "<p>" +
                type +
                " | " +
                distance +
                "</p>" +
                "<p>" +
                description +
                "</p>" +
                "</div>"
            );
        })
        .join("");
}

function renderResult(data, imageBase64) {
    foodImage.src = imageBase64;
    foodImage.style.display = "block";

    resultTitle.textContent = data.food_name || "Food analysis";
    resultSubtitle.textContent =
        (data.category || "Unknown category") +
        " • " +
        (data.calories_per_100g || "N/A") +
        " calories / 100g";

    const nutritionEntries = Object.entries(data.nutritional_info || {});
    let nutritionBody = "<p>No nutrition data received.</p>";

    if (nutritionEntries.length > 0) {
        const nutritionRows = nutritionEntries
            .map(([key, value]) => {
                const normalizedValue = value || "N/A";
                let suffix = "";
                if (normalizedValue !== "N/A") {
                    suffix = key === "sodium" ? " mg" : " g";
                }
                return (
                    '<div class="kv-item">' +
                    "<span>" +
                    key.replace(/_/g, " ") +
                    "</span>" +
                    "<strong>" +
                    normalizedValue +
                    suffix +
                    "</strong>" +
                    "</div>"
                );
            })
            .join("");

        nutritionBody = '<div class="kv-grid">' + nutritionRows + "</div>";
    }

    const vitamins = Object.entries(data.vitamins_minerals || {})
        .filter(([, value]) => value && value !== "N/A")
        .map(([key, value]) => {
            return '<span class="tag">' + key.replace(/_/g, " ") + ": " + value + "</span>";
        })
        .join("");

    const dietary = (data.dietary_restrictions || [])
        .map((item) => '<span class="tag">' + item + "</span>")
        .join("");

    const allergenBody =
        Array.isArray(data.allergens) && data.allergens.length > 0
            ? '<div class="tag-list">' +
              data.allergens.map((item) => '<span class="tag">' + item + "</span>").join("") +
              "</div>"
            : "<p>No common allergens identified.</p>";

    const cards = [
        infoCard(
            "Core Snapshot",
            '<div class="kv-grid">' +
                '<div class="kv-item"><span>Serving Size</span><strong>' +
                (data.serving_size || "N/A") +
                '</strong></div>' +
                '<div class="kv-item"><span>Glycemic Index</span><strong>' +
                (data.glycemic_index || "N/A") +
                "</strong></div>" +
                "</div>"
        ),
        infoCard("Macronutrients (per 100g)", nutritionBody),
        infoCard(
            "Vitamins & Minerals",
            vitamins ? '<div class="tag-list">' + vitamins + "</div>" : "<p>No additional micronutrient details.</p>"
        ),
        infoCard("Health Benefits", formatList(data.health_benefits, "No health benefits listed.")),
        infoCard("Allergens", allergenBody),
        infoCard(
            "Dietary Compatibility",
            dietary ? '<div class="tag-list">' + dietary + "</div>" : "<p>No dietary tags available.</p>"
        ),
        infoCard("Storage Tips", "<p>" + (data.storage_tips || "No storage guidance.") + "</p>"),
        infoCard(
            "Preparation Suggestions",
            formatList(data.preparation_suggestions, "No preparation suggestions available.")
        ),
        infoCard("Nearby Places", renderPlaces(data.nearby_places))
    ];

    resultGrid.innerHTML = cards.join("");
}

async function handleUpload(file) {
    if (file.type.startsWith("image/") === false) {
        showMessage("Please upload a valid image file.");
        return;
    }

    if (file.size > 16 * 1024 * 1024) {
        showMessage("File exceeds 16MB limit.");
        return;
    }

    fileInfo.innerHTML =
        "<strong>" + file.name + "</strong> • " + (file.size / (1024 * 1024)).toFixed(2) + " MB";

    const formData = new FormData();
    formData.append("file", file);

    if (userLocation) {
        formData.append("latitude", userLocation.latitude);
        formData.append("longitude", userLocation.longitude);
    }

    setLoading(true);
    progressFill.style.width = "0%";
    const progressInterval = simulateProgress();

    try {
        const response = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        if (response.status === 401) {
            window.location.href = "/login";
            return;
        }

        const data = await response.json();
        clearInterval(progressInterval);
        progressFill.style.width = "100%";

        setTimeout(() => {
            setLoading(false);
            if (data.success) {
                renderResult(data.food_data, data.image_base64);
                showMessage("Analysis completed successfully.", "success");
            } else {
                showMessage(data.error || "Analysis failed.");
            }
        }, 300);
    } catch (error) {
        clearInterval(progressInterval);
        setLoading(false);
        showMessage("Network error: " + error.message);
    }
}

chooseFileBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) {
        handleUpload(file);
    }
});

uploadArea.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadArea.classList.add("dragover");
});

uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("dragover");
});

uploadArea.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadArea.classList.remove("dragover");
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) {
        handleUpload(file);
    }
});

resetBtn.addEventListener("click", () => {
    resultTitle.textContent = "No analysis yet";
    resultSubtitle.textContent = "Your detailed nutrition report appears here.";
    resultGrid.innerHTML = "";
    foodImage.style.display = "none";
    foodImage.src = "";
    fileInfo.textContent = "";
    fileInput.value = "";
});

initLocation();
