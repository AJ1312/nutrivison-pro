const historyGrid = document.getElementById("historyGrid");
const emptyState = document.getElementById("emptyState");
const detailModal = document.getElementById("detailModal");
const modalContent = document.getElementById("modalContent");
const closeModalBtn = document.getElementById("closeModal");

const defaultEmptyMessage = "Upload your first food image and your history will appear here.";

let currentPage = 1;
let isLoading = false;
let hasMore = true;

function escapeHtml(text) {
    return String(text)
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
        if (value.length === 0) {
            return fallback;
        }
        return value.map((item) => String(item).trim()).filter(Boolean).join(", ");
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

function prettifyKey(rawKey) {
    return safeText(rawKey, "detail")
        .replaceAll("_", " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getEmptyStateMessageElement() {
    return emptyState ? emptyState.querySelector("p") : null;
}

function setEmptyStateMessage(message) {
    const paragraph = getEmptyStateMessageElement();
    if (paragraph) {
        paragraph.textContent = message || defaultEmptyMessage;
    }
}

function renderCardImage(image, altText) {
    if (!image) {
        return '<div class="img-fallback"><i class="fa-solid fa-image"></i><span>No image preview</span></div>';
    }

    return '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(altText) + '" loading="lazy">';
}

function buildCard(analysis) {
    const analysisId = typeof analysis._id === "string" ? analysis._id.trim() : "";
    const hasValidId = Boolean(analysisId);
    const disabledAttr = hasValidId ? "" : ' disabled aria-disabled="true"';
    const food = analysis.food_data || {};
    const title = safeText(food.food_name, "Unknown food");
    const category = safeText(food.category, "Unknown category");
    const calories = safeText(food.calories_per_100g, "N/A");
    const timestamp = safeText(analysis.timestamp, "Unknown time");
    const image = typeof analysis.image_preview === "string" ? analysis.image_preview.trim() : "";

    return (
        '<article class="card" data-id="' +
        escapeHtml(analysisId) +
        '">' +
        renderCardImage(image, title) +
        '<div class="card-body">' +
        '<h3 class="card-title">' +
        escapeHtml(title) +
        "</h3>" +
        '<p class="meta">' +
        escapeHtml(category) +
        "</p>" +
        '<p class="meta">' +
        escapeHtml(calories) +
        " calories / 100g</p>" +
        '<p class="meta">' +
        escapeHtml(timestamp) +
        "</p>" +
        '<div class="controls">' +
        '<button type="button" class="view-btn" data-action="view" data-id="' +
        escapeHtml(analysisId) +
        '"' +
        disabledAttr +
        ">View</button>" +
        '<button type="button" class="del-btn" data-action="delete" data-id="' +
        escapeHtml(analysisId) +
        '"' +
        disabledAttr +
        ">Delete</button>" +
        "</div>" +
        "</div>" +
        "</article>"
    );
}

function buildNutritionItems(nutritionalInfo) {
    const entries = Object.entries(nutritionalInfo || {});
    if (entries.length === 0) {
        return '<p class="modal-empty">No macro details available.</p>';
    }

    return entries
        .map(([key, value]) => {
            return (
                '<div class="modal-item">' +
                "<span>" +
                escapeHtml(prettifyKey(key)) +
                "</span>" +
                "<strong>" +
                escapeHtml(safeText(value, "N/A")) +
                "</strong>" +
                "</div>"
            );
        })
        .join("");
}

function buildList(items, emptyText) {
    if (!Array.isArray(items) || items.length === 0) {
        return '<p class="modal-empty">' + escapeHtml(emptyText) + "</p>";
    }

    return (
        '<ul class="modal-list">' +
        items
            .map((item) => {
                return "<li>" + escapeHtml(safeText(item, "N/A")) + "</li>";
            })
            .join("") +
        "</ul>"
    );
}

function buildModal(analysis) {
    const food = analysis.food_data || {};
    const image = typeof analysis.image_preview === "string" ? analysis.image_preview.trim() : "";
    const title = safeText(food.food_name, "Food details");

    const imageBlock = image
        ? '<img class="modal-image" src="' +
          escapeHtml(image) +
          '" alt="' +
          escapeHtml(title) +
          '">'
        : '<div class="modal-image-empty"><i class="fa-solid fa-image"></i><span>No image preview available</span></div>';

    return (
        '<h2 class="modal-title" id="detailModalTitle">' +
        escapeHtml(title) +
        "</h2>" +
        '<p class="meta">' +
        escapeHtml(safeText(food.category, "Unknown category")) +
        " | " +
        escapeHtml(safeText(food.calories_per_100g, "N/A")) +
        " calories / 100g</p>" +
        imageBlock +
        '<h3 class="modal-heading">Nutritional Information</h3>' +
        '<div class="modal-grid">' +
        buildNutritionItems(food.nutritional_info) +
        "</div>" +
        '<h3 class="modal-heading">Health Benefits</h3>' +
        buildList(food.health_benefits, "No health benefits listed.")
    );
}

function setModalVisibility(isVisible) {
    if (!detailModal || !modalContent) {
        return;
    }

    const hidden = !isVisible;
    detailModal.classList.toggle("hidden", hidden);
    detailModal.toggleAttribute("hidden", hidden);
    detailModal.setAttribute("aria-hidden", String(hidden));

    if (hidden) {
        modalContent.innerHTML = "";
    }
}

function showLoadingSpinner() {
    const spinner = document.createElement("div");
    spinner.id = "loadingSpinner";
    spinner.className = "loading-spinner";
    spinner.innerHTML = '<div class="spinner"></div><p>Loading history...</p>';

    if (historyGrid) {
        historyGrid.insertAdjacentElement("afterend", spinner);
    }
}

function hideLoadingSpinner() {
    const spinner = document.getElementById("loadingSpinner");
    if (spinner) {
        spinner.remove();
    }
}

async function loadHistory(append = false) {
    if (!historyGrid || !emptyState || isLoading) {
        return;
    }

    isLoading = true;
    showLoadingSpinner();

    try {
        const response = await fetch(`/api/history?page=${currentPage}&limit=20`);

        if (response.status === 401) {
            window.location.href = "/login";
            return;
        }

        const payload = await response.json();
        if (payload.success !== true) {
            throw new Error(payload.error || "Failed to load history");
        }

        const analyses = Array.isArray(payload.analyses) ? payload.analyses : [];
        const pagination = payload.pagination || {};

        hasMore = pagination.has_more || false;

        if (analyses.length === 0 && !append) {
            historyGrid.innerHTML = "";
            setEmptyStateMessage(defaultEmptyMessage);
            emptyState.classList.remove("hidden");
            return;
        }

        emptyState.classList.add("hidden");
        setEmptyStateMessage(defaultEmptyMessage);

        if (append) {
            historyGrid.innerHTML += analyses.map(buildCard).join("");
        } else {
            historyGrid.innerHTML = analyses.map(buildCard).join("");
        }

        // Show "Load More" button if there are more results
        updateLoadMoreButton();
    } catch (error) {
        if (!append) {
            historyGrid.innerHTML = "";
        }
        setEmptyStateMessage("Unable to load history: " + safeText(error.message, "Unknown error"));
        emptyState.classList.remove("hidden");
    } finally {
        isLoading = false;
        hideLoadingSpinner();
    }
}

function updateLoadMoreButton() {
    let loadMoreBtn = document.getElementById("loadMoreBtn");

    if (hasMore) {
        if (!loadMoreBtn) {
            loadMoreBtn = document.createElement("button");
            loadMoreBtn.id = "loadMoreBtn";
            loadMoreBtn.className = "load-more-btn";
            loadMoreBtn.textContent = "Load More";
            loadMoreBtn.addEventListener("click", loadMoreHistory);

            if (historyGrid && historyGrid.parentNode) {
                historyGrid.parentNode.insertBefore(loadMoreBtn, historyGrid.nextSibling);
            }
        }
        loadMoreBtn.style.display = "block";
    } else if (loadMoreBtn) {
        loadMoreBtn.style.display = "none";
    }
}

async function loadMoreHistory() {
    if (!isLoading && hasMore) {
        currentPage++;
        await loadHistory(true);
    }
}

async function viewAnalysis(analysisId) {
    if (!analysisId) {
        window.alert("Invalid analysis id.");
        return;
    }

    try {
        const response = await fetch("/analysis/" + encodeURIComponent(analysisId));
        if (response.status === 401) {
            window.location.href = "/login";
            return;
        }

        const payload = await response.json();
        if (payload.success !== true) {
            window.alert(payload.error || "Unable to open details.");
            return;
        }

        modalContent.innerHTML = buildModal(payload.analysis || {});
        setModalVisibility(true);
    } catch (error) {
        window.alert("Unable to open details: " + safeText(error.message, "Unknown error"));
    }
}

async function deleteAnalysis(analysisId) {
    if (!analysisId) {
        window.alert("Invalid analysis id.");
        return;
    }

    const confirmed = window.confirm("Delete this analysis permanently?");
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch("/delete/" + encodeURIComponent(analysisId), { method: "DELETE" });
        if (response.status === 401) {
            window.location.href = "/login";
            return;
        }

        const payload = await response.json();
        if (payload.success !== true) {
            window.alert(payload.error || "Delete failed.");
            return;
        }

        const card = document.querySelector('.card[data-id="' + analysisId + '"]');
        if (card) {
            card.remove();
        }

        if (!document.querySelector(".card")) {
            setEmptyStateMessage(defaultEmptyMessage);
            emptyState.classList.remove("hidden");
        }
    } catch (error) {
        window.alert("Delete failed: " + safeText(error.message, "Unknown error"));
    }
}

if (historyGrid) {
    historyGrid.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button || button.disabled) {
            return;
        }

        const action = button.getAttribute("data-action");
        const id = button.getAttribute("data-id") || "";

        if (action === "view") {
            viewAnalysis(id);
        }

        if (action === "delete") {
            deleteAnalysis(id);
        }
    });
}

function closeModal() {
    setModalVisibility(false);
}

if (closeModalBtn) {
    closeModalBtn.addEventListener("click", closeModal);
}

if (detailModal) {
    detailModal.addEventListener("click", (event) => {
        if (event.target === detailModal) {
            closeModal();
        }
    });
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && detailModal && !detailModal.classList.contains("hidden")) {
        closeModal();
    }
});

if (historyGrid && emptyState) {
    setModalVisibility(false);
    loadHistory();
}
