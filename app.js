// === Config & Keys ===
const BACKEND_URL   = "https://biblio-c1en.onrender.com/proxy-google-vision";
const LIB_KEY       = "biblioLibrary";
const OCR_CACHE_KEY = "ocrCache";

// === DOM refs ===
const cameraInput    = document.getElementById("cameraInput");
const uploadInput    = document.getElementById("uploadInput");
const previewImage   = document.getElementById("previewImage");
const extractBtn     = document.getElementById("extractBtn");
const showLibBtn     = document.getElementById("showLibBtn");
const recognizedTitle= document.getElementById("recognizedTitle");
const notification   = document.getElementById("notification");
const libraryList    = document.getElementById("libraryList");

// === Expose global helpers for inline onclicks ===
function openCamera()  { cameraInput.click(); }
function openLibrary() { uploadInput.click(); }
window.openCamera  = openCamera;
window.openLibrary = openLibrary;

// === Helpers ===
function showNotification(msg) {
  console.log("🔔", msg);
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
[cameraInput, uploadInput].forEach(input => {
  input.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    console.log("🖼️ File selected:", file.name);
    const reader = new FileReader();
    reader.onload = () => {
      previewImage.src = reader.result;
      previewImage.style.display = "block";
      extractBtn.disabled = false;
      recognizedTitle.textContent = "";
      console.log("🖼️ Preview image loaded, extract ready");
    };
    reader.readAsDataURL(file);
  });
});

// === Extract Handler ===
extractBtn.addEventListener("click", async () => {
  console.log("🔍 Extract button clicked");
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
    console.log("📸 Preview src prefix:", dataUrl.slice(0,30) + "…");
    const base64 = dataUrl.split(",")[1];
    console.log("🔡 Base64 length:", base64.length);

    // 1) OCR cache
    const ocrCache = getOcrCache();
    let title = ocrCache[base64];
    console.log("📦 Cached OCR hit?", Boolean(title));

    if (!title) {
      // 2) call backend
      console.log("🛰️ Calling OCR backend at:", BACKEND_URL);
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 })
      });
      console.log("⚙️ fetch() returned status", res.status);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const json = await res.json();
      // support both our `result.text` and fullTextAnnotation.text
      const fullText = json.text
                     || json.fullTextAnnotation?.text
                     || "";
      console.log("📥 Raw response snippet:", JSON.stringify(json).slice(0,200), "…");
      console.log("📄 Parsed fullText:", fullText);

      // 3) parse first non-empty line
      const lines = fullText
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 0);

      title = lines[0] || "";
      console.log("📄 Extracted title:", title);

      if (!title) {
        showNotification("No text found in image.");
        return;
      }

      // 4) cache OCR result
      ocrCache[base64] = title;
      saveOcrCache(ocrCache);
    }

    recognizedTitle.innerHTML = `<strong>Title:</strong> ${title}`;

    // 5) duplicate check
    const library = getLibrary();
    if (library.some(b => b.title.toLowerCase() === title.toLowerCase())) {
      showNotification("This book is already in your library.");
      return;
    }

    // 6) lookup on OpenLibrary
    const lookup = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`
    ).then(r => r.json());
    const doc = lookup.docs?.[0] || {};
    const book = {
      title,
      author: doc.author_name?.join(", ") || "Unknown",
      year:   doc.first_publish_year || "Unknown"
    };

    // 7) save to localStorage
    library.push(book);
    saveLibrary(library);
    showNotification("Book added to library!");
  }
  catch (err) {
    console.error(err);
    showNotification("Error: " + err.message);
  }
  finally {
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
  navigator.serviceWorker.register("sw.js")
    .then(_ => console.log("🛠️ Service worker registered"))
    .catch(err => console.error("SW registration failed:", err));
}
