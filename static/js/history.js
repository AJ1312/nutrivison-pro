const historyGrid = document.getElementById("historyGrid");
const emptyState = document.getElementById("emptyState");
const detailModal = document.getElementById("detailModal");
const modalContent = document.getElementById("modalContent");
const closeModalBtn = document.getElementById("closeModal");

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function buildCard(analysis) {
    const food = analysis.food_data || {};
    const title = escapeHtml(food.food_name || "Unknown food");
    const category = escapeHtml(food.category || "Unknown category");
    const calories = escapeHtml(food.calories_per_100g || "N/A");
    const timestamp = escapeHtml(analysis.timestamp || "Unknown time");
    const image = analysis.image_preview || "";

    return (
        '<article class="card" data-id="' +
        analysis._id +
        '">' +
        '<img src="' +
        image +
        '" alt="' +
        title +
        '">' +
        '<div class="card-body">' +
        '<h3 class="card-title">' +
        title +
        "</h3>" +
        '<p class="meta">' +
        category +
        "</p>" +
        '<p class="meta">' +
        calories +
        " calories / 100g</p>" +
        '<p class="meta">' +
        timestamp +
        "</p>" +
        '<div class="controls">' +
        '<button class="view-btn" data-action="view" data-id="' +
        analysis._id +
        '">View</button>' +
        '<button class="del-btn" data-action="delete" data-id="' +
        analysis._id +
        '">Delete</button>' +
        "</div>" +
        "</div>" +
        "</article>"
    );
}

function buildModal(analysis) {
    const food = analysis.food_data || {};
    const nutrition = Object.entries(food.nutritional_info || {})
        .map(([key, value]) => {
            return (
                '<div class="modal-item">' +
                "<span>" +
                escapeHtml(key.replaceAll("_", " ")) +
                "</span>" +
                "<strong>" +
                escapeHtml(value || "N/A") +
                "</strong>" +
                "</div>"
            );
        })
        .join("");

    const benefits = (food.health_benefits || [])
        .map((item) => "<li>" + escapeHtml(item) + "</li>")
        .join("");

    const imageBlock = analysis.image_preview
        ? '<img src="' +
          analysis.image_preview +
          '" alt="' +
          escapeHtml(food.food_name || "Food image") +
          '" style="width:100%;max-height:300px;object-fit:cover;border-radius:12px;margin-top:12px;">'
        : "";

    return (
        "<h2>" +
        escapeHtml(food.food_name || "Food details") +
        "</h2>" +
        '<p class="meta">' +
        escapeHtml(food.category || "Unknown category") +
        " | " +
        escapeHtml(food.calories_per_100g || "N/A") +
        " calories / 100g</p>" +
        imageBlock +
        '<h3 style="margin-top:14px;">Nutritional Information</h3>' +
        '<div class="modal-grid">' +
        (nutrition || "<p>No macro details available.</p>") +
        "</div>" +
        '<h3 style="margin-top:14px;">Health Benefits</h3>' +
        (benefits
            ? '<ul style="margin:8px 0 0 20px;line-height:1.6;">' + benefits + "</ul>"
            : '<p style="margin-top:6px;">No health benefits listed.</p>')
    );
}

async function loadHistory() {
    try {
        const response = await fetch("/api/history");

        if (response.status === 401) {
            window.location.href = "/login";
            return;
        }

        const payload = await response.json();
        if (payload.success !== true) {
            throw new Error(payload.error || "Failed to load history");
        }

        const analyses = payload.analyses || [];
        if (analyses.length === 0) {
            historyGrid.innerHTML = "";
            emptyState.classList.remove("hidden");
            return;
        }

        emptyState.classList.add("hidden");
        historyGrid.innerHTML = analyses.map(buildCard).join("");
    } catch (error) {
        historyGrid.innerHTML = "";
        emptyState.classList.remove("hidden");
        const paragraph = emptyState.querySelector("p");
        if (paragraph) {
            paragraph.textContent = "Unable to load history: " + error.message;
        }
    }
}

async function viewAnalysis(analysisId) {
    const response = await fetch("/analysis/" + analysisId);
    if (response.status === 401) {
        window.location.href = "/login";
        return;
    }

    const payload = await response.json();
    if (payload.success !== true) {
        alert(payload.error || "Unable to open details.");
        return;
    }

    modalContent.innerHTML = buildModal(payload.analysis);
    detailModal.classList.remove("hidden");
}

async function deleteAnalysis(analysisId) {
    const confirmed = window.confirm("Delete this analysis permanently?");
    if (!confirmed) {
        return;
    }

    const response = await fetch("/delete/" + analysisId, { method: "DELETE" });
    if (response.status === 401) {
        window.location.href = "/login";
        return;
    }

    const payload = await response.json();
    if (payload.success !== true) {
        alert(payload.error || "Delete failed.");
        return;
    }

    const card = document.querySelector('.card[data-id="' + analysisId + '"]');
    if (card) {
        card.remove();
    }

    if (!document.querySelector(".card")) {
        emptyState.classList.remove("hidden");
    }
}

historyGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
        return;
    }

    const action = button.getAttribute("data-action");
    const id = button.getAttribute("data-id");

    if (action === "view") {
        viewAnalysis(id);
    }

    if (action === "delete") {
        deleteAnalysis(id);
    }
});

closeModalBtn.addEventListener("click", () => detailModal.classList.add("hidden"));

detailModal.addEventListener("click", (event) => {
    if (event.target === detailModal) {
        detailModal.classList.add("hidden");
    }
});

loadHistory();
