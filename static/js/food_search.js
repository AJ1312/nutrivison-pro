const form = document.getElementById("foodSearchForm");
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

function listMarkup(items, fallbackText) {
    if (!Array.isArray(items) || items.length === 0) {
        return '<p>' + escapeHtml(fallbackText) + "</p>";
    }

    return '<ul class="result-list">' + items.map((item) => "<li>" + escapeHtml(safeText(item, "N/A")) + "</li>").join("") + "</ul>";
}

function renderMetrics(metrics) {
    const macros = typeof metrics.macros === "object" && metrics.macros ? metrics.macros : {};
    const micros = typeof metrics.micros === "object" && metrics.micros ? metrics.micros : {};
    const notes = Array.isArray(metrics.health_notes) ? metrics.health_notes : [];
    const alternatives = Array.isArray(metrics.healthier_alternatives) ? metrics.healthier_alternatives : [];

    const overview =
        '<article class="result-card">' +
        "<h3>Overview</h3>" +
        '<div class="kv-grid">' +
        '<div class="kv-item"><span>Food</span><strong>' +
        escapeHtml(safeText(metrics.food_name)) +
        "</strong></div>" +
        '<div class="kv-item"><span>Serving (g)</span><strong>' +
        escapeHtml(safeText(metrics.serving_size_g)) +
        "</strong></div>" +
        '<div class="kv-item"><span>Calories / 100g</span><strong>' +
        escapeHtml(safeText(metrics.calories_per_100g)) +
        "</strong></div>" +
        '<div class="kv-item"><span>Glycemic Index</span><strong>' +
        escapeHtml(safeText(metrics.glycemic_index)) +
        "</strong></div>" +
        "</div>" +
        "</article>";

    const macroCard =
        '<article class="result-card">' +
        "<h3>Macronutrients</h3>" +
        '<div class="kv-grid">' +
        '<div class="kv-item"><span>Protein (g)</span><strong>' +
        escapeHtml(safeText(macros.protein_g)) +
        "</strong></div>" +
        '<div class="kv-item"><span>Carbs (g)</span><strong>' +
        escapeHtml(safeText(macros.carbs_g)) +
        "</strong></div>" +
        '<div class="kv-item"><span>Fat (g)</span><strong>' +
        escapeHtml(safeText(macros.fat_g)) +
        "</strong></div>" +
        '<div class="kv-item"><span>Fiber (g)</span><strong>' +
        escapeHtml(safeText(macros.fiber_g)) +
        "</strong></div>" +
        "</div>" +
        "</article>";

    const microCard =
        '<article class="result-card">' +
        "<h3>Micronutrients</h3>" +
        '<div class="kv-grid">' +
        '<div class="kv-item"><span>Sodium (mg)</span><strong>' +
        escapeHtml(safeText(micros.sodium_mg)) +
        "</strong></div>" +
        '<div class="kv-item"><span>Potassium (mg)</span><strong>' +
        escapeHtml(safeText(micros.potassium_mg)) +
        "</strong></div>" +
        '<div class="kv-item"><span>Iron (mg)</span><strong>' +
        escapeHtml(safeText(micros.iron_mg)) +
        "</strong></div>" +
        "</div>" +
        "</article>";

    const notesCard =
        '<article class="result-card">' +
        "<h3>Health Notes</h3>" +
        listMarkup(notes, "No health notes available.") +
        "</article>";

    const alternativesContent =
        alternatives.length > 0
            ? '<div class="tags">' +
              alternatives
                  .map((item) => '<span class="tag">' + escapeHtml(safeText(item, "N/A")) + "</span>")
                  .join("") +
              "</div>"
            : "<p>No alternatives suggested.</p>";

    const alternativesCard =
        '<article class="result-card">' +
        "<h3>Healthier Alternatives</h3>" +
        alternativesContent +
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
        showMessage(safeText(error.message, "Something went wrong."));
        resultBox.innerHTML =
            '<div class="result-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><p>Failed to fetch metrics.</p></div>';
    }
});
