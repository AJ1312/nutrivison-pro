const form = document.getElementById("assistantForm");
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

function renderAssistant(assistant) {
    const data = typeof assistant === "object" && assistant ? assistant : {};
    const points = Array.isArray(data.key_points) ? data.key_points : [];

    resultBox.innerHTML =
        '<article class="result-card">' +
        "<h3>Answer</h3>" +
        "<p>" +
        escapeHtml(safeText(data.answer, "No answer generated.")) +
        "</p>" +
        "</article>" +
        '<article class="result-card">' +
        "<h3>Key Points</h3>" +
        (points.length > 0
            ? '<ul class="result-list">' +
              points.map((point) => "<li>" + escapeHtml(safeText(point, "Point")) + "</li>").join("") +
              "</ul>"
            : "<p>No key points were returned.</p>") +
        "</article>" +
        '<article class="result-card">' +
        "<h3>Safety Note</h3>" +
        "<p>" +
        escapeHtml(safeText(data.caution, "This is educational guidance, not a diagnosis.")) +
        "</p>" +
        "</article>";
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("");
    resultBox.innerHTML = '<div class="result-placeholder"><p>Thinking...</p></div>';

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
        const response = await fetch("/api/nutrition-assistant", {
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
            throw new Error(data.error || "Could not generate answer.");
        }

        renderAssistant(data.assistant || {});
        showMessage("Assistant response generated.", "success");
    } catch (error) {
        showMessage(safeText(error.message, "Something went wrong."));
        resultBox.innerHTML =
            '<div class="result-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><p>Failed to fetch assistant answer.</p></div>';
    }
});
