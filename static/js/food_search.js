const form = document.getElementById("foodSearchForm");
const resultBox = document.getElementById("resultBox");
const formMessage = document.getElementById("formMessage");

function showMessage(text, type = "error") {
    formMessage.innerHTML = text ? '<div class="message ' + type + '">' + text + "</div>" : "";
}

function renderMetrics(metrics) {
    const macros = metrics.macros || {};
    const micros = metrics.micros || {};
    const notes = Array.isArray(metrics.health_notes) ? metrics.health_notes : [];
    const alternatives = Array.isArray(metrics.healthier_alternatives) ? metrics.healthier_alternatives : [];

    const overview =
        '<article class="result-card">' +
        "<h3>Overview</h3>" +
        '<div class="kv-grid">' +
        '<div class="kv-item"><span>Food</span><strong>' +
        (metrics.food_name || "N/A") +
        "</strong></div>" +
        '<div class="kv-item"><span>Serving (g)</span><strong>' +
        (metrics.serving_size_g || "N/A") +
        "</strong></div>" +
        '<div class="kv-item"><span>Calories / 100g</span><strong>' +
        (metrics.calories_per_100g || "N/A") +
        "</strong></div>" +
        '<div class="kv-item"><span>Glycemic Index</span><strong>' +
        (metrics.glycemic_index || "N/A") +
        "</strong></div>" +
        "</div>" +
        "</article>";

    const macroCard =
        '<article class="result-card">' +
        "<h3>Macronutrients</h3>" +
        '<div class="kv-grid">' +
        '<div class="kv-item"><span>Protein (g)</span><strong>' +
        (macros.protein_g || "N/A") +
        "</strong></div>" +
        '<div class="kv-item"><span>Carbs (g)</span><strong>' +
        (macros.carbs_g || "N/A") +
        "</strong></div>" +
        '<div class="kv-item"><span>Fat (g)</span><strong>' +
        (macros.fat_g || "N/A") +
        "</strong></div>" +
        '<div class="kv-item"><span>Fiber (g)</span><strong>' +
        (macros.fiber_g || "N/A") +
        "</strong></div>" +
        "</div>" +
        "</article>";

    const microCard =
        '<article class="result-card">' +
        "<h3>Micronutrients</h3>" +
        '<div class="kv-grid">' +
        '<div class="kv-item"><span>Sodium (mg)</span><strong>' +
        (micros.sodium_mg || "N/A") +
        "</strong></div>" +
        '<div class="kv-item"><span>Potassium (mg)</span><strong>' +
        (micros.potassium_mg || "N/A") +
        "</strong></div>" +
        '<div class="kv-item"><span>Iron (mg)</span><strong>' +
        (micros.iron_mg || "N/A") +
        "</strong></div>" +
        "</div>" +
        "</article>";

    const notesCard =
        '<article class="result-card">' +
        "<h3>Health Notes</h3>" +
        '<ul class="result-list">' +
        notes.map((note) => "<li>" + note + "</li>").join("") +
        "</ul>" +
        "</article>";

    const alternativesCard =
        '<article class="result-card">' +
        "<h3>Healthier Alternatives</h3>" +
        '<div class="tags">' +
        alternatives.map((item) => '<span class="tag">' + item + "</span>").join("") +
        "</div>" +
        "</article>";

    resultBox.innerHTML = overview + macroCard + microCard + notesCard + alternativesCard;
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("");
    resultBox.innerHTML = '<div class="result-placeholder"><p>Fetching food metrics...</p></div>';

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
        const response = await fetch("/api/food-search", {
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
            throw new Error(data.error || "Could not fetch metrics.");
        }

        renderMetrics(data.metrics || {});
        showMessage("Metrics fetched successfully.", "success");
    } catch (error) {
        showMessage(error.message || "Something went wrong.");
        resultBox.innerHTML =
            '<div class="result-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><p>Failed to fetch metrics.</p></div>';
    }
});
