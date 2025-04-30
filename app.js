// === Config & Keys ===
const BACKEND_URL = "https://biblio-c1en.onrender.com/proxy-google-vision";
const LIB_KEY = "biblioLibrary";
const OCR_CACHE_KEY = "ocrCache";

// === DOM refs ===
const cameraInput   = document.getElementById("cameraInput");
const uploadInput   = document.getElementById("uploadInput");
const previewImage  = document.getElementById("previewImage");
const extractBtn    = document.getElementById("extractBtn");
const showLibBtn    = document.getElementById("showLibBtn");
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
function openLibrary() { uploadInput.click(); }

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
  const dataUrl = previewImage.src;
  if (!dataUrl) {
    showNotification("Please choose an image first.");
    return;
  }

  extractBtn.disabled = true;
  const origText = extractBtn.textContent;
  extractBtn.textContent = "Scanning…";

  try {
    // strip off the data:// prefix
    const base64 = dataUrl.split(",")[1];
    console.log("🔡 Base64 length:", base64.length);

    // 1) OCR cache lookup
    const cache = getOcrCache();
    let lines = cache[base64];
    if (lines) {
      // if somehow we stored a raw string, convert back to array
      if (typeof lines === "string") {
        console.warn("⚠️ OCR cache entry was a string, converting to array");
        lines = lines
          .split("\n")
          .map(l => l.trim())
          .filter(l => l);
      }
      console.log("📦 Cached OCR hit, lines:", lines);
    } else {
      // 2) call backend
      console.log("🛰️ Calling OCR backend at:", BACKEND_URL);
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 })
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      console.log("📥 Raw response:", data);

      // pull out the actual text
      const fullText = data.fullTextAnnotation?.text || data.text || "";
      console.log("📄 Parsed fullText:", fullText);

      // split into non-empty lines
      lines = fullText
        .split("\n")
        .map(l => l.trim())
        .filter(l => l);

      if (lines.length === 0) {
        showNotification("No text found in image.");
        return;
      }

      // cache it
      cache[base64] = lines;
      saveOcrCache(cache);
      console.log("💾 Saved to OCR cache");
    }

    // 3) Process each title line
    const library = getLibrary();
    let addedAny = false;

    for (const title of lines) {
      console.log("🌟 Processing title:", title);
      // skip exact duplicates
      if (library.some(b => b.title.toLowerCase() === title.toLowerCase())) {
        console.log("⚠️ Already in library, skipping:", title);
        continue;
      }

      // 4) lookup OpenLibrary
      let author = "Unknown", year = "Unknown";
      try {
        const lookup = await fetch(
          `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`
        ).then(r => r.json());
        const doc = lookup.docs?.[0];
        if (doc) {
          author = doc.author_name?.join(", ") || author;
          year   = doc.first_publish_year || year;
        }
      } catch (e) {
        console.warn("⚠️ OpenLibrary lookup failed for", title, e);
      }

      const book = { title, author, year };
      library.push(book);
      addedAny = true;
      console.log("✅ Added book:", book);
    }

    if (addedAny) {
      saveLibrary(library);
      showNotification("Books added to library!");
    } else {
      showNotification("No new books were added.");
    }

  } catch (err) {
    console.error(err);
    showNotification("Error: " + err.message);
  } finally {
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
    showLibBtn.textContent     = "Show Library";
    return;
  }

  showLibBtn.textContent     = "Hide Library";
  libraryList.style.display  = "block";

  if (lib.length === 0) {
    libraryList.textContent = "Your library is empty.";
    return;
  }

  // render each book
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
    .then(() => console.log("🛠️ Service worker registered"))
    .catch(e => console.warn("SW failed:", e));
}
