const form = document.getElementById("mealPlannerForm");
const resultBox = document.getElementById("resultBox");
const formMessage = document.getElementById("formMessage");

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function safeText(value, fallback = "N/A") {
    if (value === null || value === undefined) {
        return fallback;
    }

    if (Array.isArray(value)) {
        const joined = value.map((item) => String(item).trim()).filter(Boolean).join(", ");
        return joined || fallback;
    }

    if (typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch (_error) {
            return fallback;
        }
    }

    const normalized = String(value).trim();
    return normalized || fallback;
}

function showMessage(text, type = "error") {
    formMessage.innerHTML = text ? '<div class="message ' + type + '">' + escapeHtml(text) + "</div>" : "";
}

function renderMealPlan(plan) {
    const summary = typeof plan.summary === "object" && plan.summary ? plan.summary : {};
    const mealPlan = Array.isArray(plan.meal_plan) ? plan.meal_plan : [];
    const tips = Array.isArray(plan.tips) ? plan.tips : [];

    const summaryCard =
        '<article class="result-card">' +
        "<h3>Daily Summary</h3>" +
        '<div class="kv-grid">' +
        '<div class="kv-item"><span>Calories</span><strong>' +
        escapeHtml(safeText(summary.daily_calories)) +
        "</strong></div>" +
        '<div class="kv-item"><span>Goal</span><strong>' +
        escapeHtml(safeText(summary.goal)) +
        "</strong></div>" +
        '<div class="kv-item"><span>Diet Type</span><strong>' +
        escapeHtml(safeText(summary.diet_type)) +
        "</strong></div>" +
        "</div>" +
        "</article>";

    const mealsHtml =
        mealPlan.length > 0
            ? mealPlan
                  .map((meal) => {
                      const mealData = typeof meal === "object" && meal ? meal : {};
                      const items = Array.isArray(mealData.items) ? mealData.items : [];

                      const itemsList =
                          items.length > 0
                              ? items
                                    .map((item) => {
                                        const entry = typeof item === "object" && item ? item : {};
                                        return (
                                            "<li>" +
                                            escapeHtml(safeText(entry.name, "Item")) +
                                            " • " +
                                            escapeHtml(safeText(entry.portion, "portion")) +
                                            " • " +
                                            escapeHtml(safeText(entry.calories)) +
                                            " kcal</li>"
                                        );
                                    })
                                    .join("")
                              : "<li>No items generated for this meal.</li>";

                      return (
                          '<article class="result-card">' +
                          "<h3>" +
                          escapeHtml(safeText(mealData.meal_name, "Meal")) +
                          " (" +
                          escapeHtml(safeText(mealData.total_calories)) +
                          " kcal)</h3>" +
                          '<ul class="result-list">' +
                          itemsList +
                          "</ul>" +
                          "</article>"
                      );
                  })
                  .join("")
            : '<article class="result-card"><h3>Meals</h3><p>No meal suggestions were returned.</p></article>';

    const tipsHtml =
        '<article class="result-card">' +
        "<h3>Tips</h3>" +
        (tips.length > 0
            ? '<ul class="result-list">' +
              tips.map((tip) => "<li>" + escapeHtml(safeText(tip, "Tip")) + "</li>").join("") +
              "</ul>"
            : "<p>No additional tips were provided.</p>") +
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
        showMessage(safeText(error.message, "Something went wrong."));
        resultBox.innerHTML =
            '<div class="result-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><p>Failed to generate meal plan.</p></div>';
    }
});
