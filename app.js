// === Config & Keys ===
const BACKEND_URL = "https://biblio-c1en.onrender.com/proxy-google-vision";
const LIB_KEY = "biblioLibrary";
const OCR_CACHE_KEY = "ocrCache";

// === DOM refs ===
const cameraInput     = document.getElementById("cameraInput");
const uploadInput     = document.getElementById("uploadInput");
const previewImage    = document.getElementById("previewImage");
const extractBtn      = document.getElementById("extractBtn");
const showLibBtn      = document.getElementById("showLibBtn");
const recognizedTitle = document.getElementById("recognizedTitle");
const notification    = document.getElementById("notification");
const libraryList     = document.getElementById("libraryList");

// === Helpers ===
function showNotification(msg) {
  notification.textContent = msg;
  notification.style.display = "block";
  setTimeout(() => notification.style.display = "none", 3000);
}

function getLibrary() {
  return JSON.parse(localStorage.getItem(LIB_KEY) || "[]");
}

function saveLibrary(lib) {
  localStorage.setItem(LIB_KEY, JSON.stringify(lib));
}

function getOcrCache() {
  return JSON.parse(localStorage.getItem(OCR_CACHE_KEY) || "{}");
}

function saveOcrCache(cache) {
  localStorage.setItem(OCR_CACHE_KEY, JSON.stringify(cache));
}

// === File pickers ===
function openCamera() { cameraInput.click(); }
function openLibrary(){ uploadInput.click(); }

[cameraInput, uploadInput].forEach(input => {
  input.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      previewImage.src = reader.result;
      previewImage.style.display = "block";
      extractBtn.disabled = false;
      recognizedTitle.textContent = "";
    };
    reader.readAsDataURL(file);
  });
});

// === Extract Handler ===
extractBtn.addEventListener("click", async () => {
  const dataUrl = previewImage.src;
  if (!dataUrl) {
    showNotification("Please choose an image first.");
    return;
  }

  // disable while scanning
  extractBtn.disabled = true;
  const origText = extractBtn.textContent;
  extractBtn.textContent = "Scanning…";

  try {
    const base64 = dataUrl.split(",")[1];

    // 1) check OCR cache
    const ocrCache = getOcrCache();
    let title = ocrCache[base64];

    if (!title) {
      // 2) call backend using documentTextDetection
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 })
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      // 3) pull out the real OCR text
      const ocrResult = await res.json();
      console.log("📝 OCR backend returned:", ocrResult);

      const fullText =
        ocrResult.fullTextAnnotation?.text ||
        ocrResult.textAnnotations?.[0]?.description ||
        "";

      if (!fullText) {
        console.warn("⚠️ OCR returned no text at all");
        showNotification("No text found in image.");
        return;
      }

      // 4) parse first non-empty line
      title = fullText
        .split("\n")
        .map(l => l.trim())
        .find(l => l.length > 0);

      if (!title) {
        console.warn("⚠️ OCR fullTextAnnotation.text was there but no line parsed");
        showNotification("No text found in image.");
        return;
      }

      // 5) cache OCR result
      ocrCache[base64] = title;
      saveOcrCache(ocrCache);
    }

    recognizedTitle.innerHTML = `<strong>Title:</strong> ${title}`;

    // 6) check library duplicate
    const library = getLibrary();
    if (library.some(b => b.title.toLowerCase() === title.toLowerCase())) {
      showNotification("This book is already in your library.");
      return;
    }

    // 7) fetch book details from OpenLibrary
    const lookup = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`
    ).then(r => r.json());

    const doc = lookup.docs?.[0] || {};
    const book = {
      title,
      author: doc.author_name?.join(", ") || "Unknown",
      year:   doc.first_publish_year || "Unknown"
    };

    // 8) save to library
    library.push(book);
    saveLibrary(library);
    showNotification("Book added to library!");

  } catch (err) {
    console.error("🔴 Extraction error:", err);
    showNotification("Error: " + err.message);
  } finally {
    // re-enable button
    extractBtn.disabled = false;
    extractBtn.textContent = origText;
  }
});

// === Show / Hide Library ===
showLibBtn.addEventListener("click", () => {
  const lib = getLibrary();
  libraryList.innerHTML = "";

  if (libraryList.style.display === "block") {
    libraryList.style.display = "none";
    showLibBtn.textContent = "Show Library";
    return;
  }

  showLibBtn.textContent = "Hide Library";
  libraryList.style.display = "block";

  if (lib.length === 0) {
    libraryList.textContent = "Your library is empty.";
    return;
  }

  lib.forEach(b => {
    const div = document.createElement("div");
    div.className = "book-item";
    div.innerHTML = `
      <h3>${b.title}</h3>
      <p><strong>Author:</strong> ${b.author}</p>
      <p><strong>Year:</strong> ${b.year}</p>
    `;
    libraryList.appendChild(div);
  });
});

// === Service Worker ===
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}
