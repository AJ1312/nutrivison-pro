const form = document.getElementById("assistantForm");
const resultBox = document.getElementById("resultBox");
const formMessage = document.getElementById("formMessage");

function showMessage(text, type = "error") {
    formMessage.innerHTML = text ? '<div class="message ' + type + '">' + text + "</div>" : "";
}

function renderAssistant(assistant) {
    const points = Array.isArray(assistant.key_points) ? assistant.key_points : [];

    resultBox.innerHTML =
        '<article class="result-card">' +
        "<h3>Answer</h3>" +
        "<p>" +
        (assistant.answer || "No answer generated.") +
        "</p>" +
        "</article>" +
        '<article class="result-card">' +
        "<h3>Key Points</h3>" +
        '<ul class="result-list">' +
        points.map((point) => "<li>" + point + "</li>").join("") +
        "</ul>" +
        "</article>" +
        '<article class="result-card">' +
        "<h3>Safety Note</h3>" +
        "<p>" +
        (assistant.caution || "This is educational guidance, not a diagnosis.") +
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
        showMessage(error.message || "Something went wrong.");
        resultBox.innerHTML =
            '<div class="result-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><p>Failed to fetch assistant answer.</p></div>';
    }
});
