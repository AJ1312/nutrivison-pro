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
        const normalized = value.map((item) => String(item).trim()).filter(Boolean).join(", ");
        return normalized || fallback;
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

function prettyKey(key) {
    return safeText(key, "item")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

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
    messageBox.innerHTML = '<div class="message ' + type + '">' + escapeHtml(safeText(text, "")) + "</div>";
    setTimeout(() => {
        messageBox.innerHTML = "";
    }, 4500);
}

function setLoading(isLoading) {
    loading.style.display = isLoading ? "block" : "none";
}

function simulateProgress() {
    let progress = 0;
    let index = 0;

    const interval = setInterval(() => {
        progress = Math.min(progress + Math.random() * 18, 92);
        progressFill.style.width = progress + "%";
        loadingText.textContent = loadingMessages[index % loadingMessages.length];
        index += 1;
    }, 520);

    return interval;
}

function formatList(items, fallback = "N/A") {
    if (!Array.isArray(items) || items.length === 0) {
        return "<p>" + escapeHtml(fallback) + "</p>";
    }

    const list = items.map((item) => "<li>" + escapeHtml(safeText(item, "N/A")) + "</li>").join("");
    return '<ul class="list">' + list + "</ul>";
}

function infoCard(title, body) {
    return '<article class="result-card"><h3>' + escapeHtml(title) + "</h3>" + body + "</article>";
}

function renderPlaces(places) {
    if (!Array.isArray(places) || places.length === 0) {
        return "<p>No nearby suggestions available.</p>";
    }

    return places
        .map((place) => {
            const name = safeText(place && place.name, "Unknown place");
            const type = safeText(place && place.type, "Place");
            const distance = safeText(place && place.distance, "Distance unavailable");
            const description = safeText(place && place.description, "");
            return (
                '<div class="place">' +
                "<strong>" +
                escapeHtml(name) +
                "</strong>" +
                "<p>" +
                escapeHtml(type) +
                " | " +
                escapeHtml(distance) +
                "</p>" +
                "<p>" +
                escapeHtml(description) +
                "</p>" +
                "</div>"
            );
        })
        .join("");
}

function renderNutritionalGrid(nutritionalInfo) {
    const entries = Object.entries(nutritionalInfo || {});
    if (entries.length === 0) {
        return "<p>No nutrition data received.</p>";
    }

    const rows = entries
        .map(([key, value]) => {
            const normalizedValue = safeText(value);
            let suffix = "";
            if (normalizedValue !== "N/A") {
                suffix = key === "sodium" ? " mg" : " g";
            }
            return (
                '<div class="kv-item">' +
                "<span>" +
                escapeHtml(prettyKey(key)) +
                "</span>" +
                "<strong>" +
                escapeHtml(normalizedValue + suffix) +
                "</strong>" +
                "</div>"
            );
        })
        .join("");

    return '<div class="kv-grid">' + rows + "</div>";
}

function renderTagBlock(items, emptyText) {
    if (!Array.isArray(items) || items.length === 0) {
        return "<p>" + escapeHtml(emptyText) + "</p>";
    }

    return (
        '<div class="tag-list">' +
        items.map((item) => '<span class="tag">' + escapeHtml(safeText(item, "N/A")) + "</span>").join("") +
        "</div>"
    );
}

function renderResult(data, imageBase64) {
    const payload = typeof data === "object" && data ? data : {};

    foodImage.src = imageBase64;
    foodImage.style.display = "block";

    resultTitle.textContent = safeText(payload.food_name, "Food analysis");
    resultSubtitle.textContent =
        safeText(payload.category, "Unknown category") +
        " • " +
        safeText(payload.calories_per_100g) +
        " calories / 100g";

    const vitamins = Object.entries(payload.vitamins_minerals || {})
        .filter(([, value]) => safeText(value) !== "N/A")
        .map(([key, value]) => {
            return escapeHtml(prettyKey(key)) + ": " + escapeHtml(safeText(value));
        });

    const cards = [
        infoCard(
            "Core Snapshot",
            '<div class="kv-grid">' +
                '<div class="kv-item"><span>Serving Size</span><strong>' +
                escapeHtml(safeText(payload.serving_size)) +
                "</strong></div>" +
                '<div class="kv-item"><span>Glycemic Index</span><strong>' +
                escapeHtml(safeText(payload.glycemic_index)) +
                "</strong></div>" +
                "</div>"
        ),
        infoCard("Macronutrients (per 100g)", renderNutritionalGrid(payload.nutritional_info)),
        infoCard(
            "Vitamins & Minerals",
            vitamins.length > 0
                ? '<div class="tag-list">' +
                  vitamins.map((entry) => '<span class="tag">' + entry + "</span>").join("") +
                  "</div>"
                : "<p>No additional micronutrient details.</p>"
        ),
        infoCard("Health Benefits", formatList(payload.health_benefits, "No health benefits listed.")),
        infoCard(
            "Allergens",
            renderTagBlock(payload.allergens, "No common allergens identified.")
        ),
        infoCard(
            "Dietary Compatibility",
            renderTagBlock(payload.dietary_restrictions, "No dietary tags available.")
        ),
        infoCard("Storage Tips", "<p>" + escapeHtml(safeText(payload.storage_tips, "No storage guidance.")) + "</p>"),
        infoCard(
            "Preparation Suggestions",
            formatList(payload.preparation_suggestions, "No preparation suggestions available.")
        ),
        infoCard("Nearby Places", renderPlaces(payload.nearby_places))
    ];

    resultGrid.innerHTML = cards.join("");
}

async function handleUpload(file) {
    if (!file || !file.type || file.type.startsWith("image/") === false) {
        showMessage("Please upload a valid image file.");
        return;
    }

    if (file.size > 16 * 1024 * 1024) {
        showMessage("File exceeds 16MB limit.");
        return;
    }

    fileInfo.innerHTML =
        "<strong>" + escapeHtml(file.name) + "</strong> • " + (file.size / (1024 * 1024)).toFixed(2) + " MB";

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
                showMessage(safeText(data.error, "Analysis failed."));
            }
        }, 300);
    } catch (error) {
        clearInterval(progressInterval);
        setLoading(false);
        showMessage("Network error: " + safeText(error.message, "Unknown error"));
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
