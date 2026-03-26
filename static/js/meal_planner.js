const form = document.getElementById("mealPlannerForm");
const resultBox = document.getElementById("resultBox");
const formMessage = document.getElementById("formMessage");

function showMessage(text, type = "error") {
    formMessage.innerHTML = '<div class="message ' + type + '">' + text + "</div>";
}

function renderMealPlan(plan) {
    const summary = plan.summary || {};
    const mealPlan = Array.isArray(plan.meal_plan) ? plan.meal_plan : [];
    const tips = Array.isArray(plan.tips) ? plan.tips : [];

    const summaryCard =
        '<article class="result-card">' +
        "<h3>Daily Summary</h3>" +
        '<div class="kv-grid">' +
        '<div class="kv-item"><span>Calories</span><strong>' +
        (summary.daily_calories || "N/A") +
        "</strong></div>" +
        '<div class="kv-item"><span>Goal</span><strong>' +
        (summary.goal || "N/A") +
        "</strong></div>" +
        '<div class="kv-item"><span>Diet Type</span><strong>' +
        (summary.diet_type || "N/A") +
        "</strong></div>" +
        "</div>" +
        "</article>";

    const mealsHtml = mealPlan
        .map((meal) => {
            const items = Array.isArray(meal.items) ? meal.items : [];
            const itemsList = items
                .map((item) => {
                    return (
                        "<li>" +
                        (item.name || "Item") +
                        " • " +
                        (item.portion || "portion") +
                        " • " +
                        (item.calories || "N/A") +
                        " kcal</li>"
                    );
                })
                .join("");

            return (
                '<article class="result-card">' +
                "<h3>" +
                (meal.meal_name || "Meal") +
                " (" +
                (meal.total_calories || "N/A") +
                " kcal)</h3>" +
                '<ul class="result-list">' +
                itemsList +
                "</ul>" +
                "</article>"
            );
        })
        .join("");

    const tipsHtml =
        '<article class="result-card">' +
        "<h3>Tips</h3>" +
        '<ul class="result-list">' +
        tips.map((tip) => "<li>" + tip + "</li>").join("") +
        "</ul>" +
        "</article>";

    resultBox.innerHTML = summaryCard + mealsHtml + tipsHtml;
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("");
    resultBox.innerHTML = '<div class="result-placeholder"><p>Generating your plan...</p></div>';

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
        const response = await fetch("/api/meal-planner", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (response.status === 401) {
            window.location.href = "/login";
            return;
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Could not generate plan.");
        }

        renderMealPlan(data.plan || {});
        showMessage("Meal plan generated successfully.", "success");
    } catch (error) {
        showMessage(error.message || "Something went wrong.");
        resultBox.innerHTML =
            '<div class="result-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><p>Failed to generate meal plan.</p></div>';
    }
});
