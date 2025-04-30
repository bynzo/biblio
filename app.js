// === Config & Keys ===
const BACKEND_URL = "https://biblio-c1en.onrender.com/proxy-google-vision";
const LIB_KEY = "biblioLibrary";
const OCR_CACHE_KEY = "ocrCache";

// === DOM refs ===
const cameraInput = document.getElementById("cameraInput");
const uploadInput = document.getElementById("uploadInput");
const previewImage = document.getElementById("previewImage");
const extractBtn = document.getElementById("extractBtn");
const showLibBtn = document.getElementById("showLibBtn");
const recognizedTitle = document.getElementById("recognizedTitle");
const notification = document.getElementById("notification");
const libraryList = document.getElementById("libraryList");

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
    console.log("🖼️ File selected:", e.target.files[0]?.name);
    const file = e.target.files[0];
    if (!file) return;
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
  console.log("📸 Preview src starts with:", dataUrl?.slice(0,50));

  if (!dataUrl) {
    console.warn("⚠️ No image selected yet!");
    showNotification("Please choose an image first.");
    return;
  }

  // disable while scanning
  extractBtn.disabled = true;
  const origText = extractBtn.textContent;
  extractBtn.textContent = "Scanning…";

  try {
    const base64 = dataUrl.split(",")[1];
    console.log("🔡 Base64 length:", base64.length);

    // 1) check OCR cache
    const ocrCache = getOcrCache();
    let title = ocrCache[base64];
    console.log("📦 Cached OCR hit?", !!title);

    if (!title) {
      // 2) call backend using documentTextDetection
      console.log("🛰️ Calling OCR backend at:", BACKEND_URL);
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 })
      });

      console.log("⚙️ fetch() returned status", res.status);
      const raw = await res.text();
      console.log("📥 Raw response text:", raw);

      const { text: fullText = "" } = JSON.parse(raw);
      console.log("📄 Parsed fullText:", fullText);

      // 3) parse first non-empty line
      title = fullText
        .split("\n")
        .map(l => l.trim())
        .find(l => l.length > 0);

      if (!title) {
        console.warn("⚠️ No parsed title found");
        showNotification("No text found in image.");
        return;
      }

      // 4) cache OCR result
      ocrCache[base64] = title;
      saveOcrCache(ocrCache);
      console.log("💾 OCR result cached for this image");
    }

    console.log("🏷️ Final extracted title:", title);
    recognizedTitle.innerHTML = `<strong>Title:</strong> ${title}`;

    // 5) check library duplicate
    const library = getLibrary();
    if (library.some(b => b.title.toLowerCase() === title.toLowerCase())) {
      console.log("📚 Duplicate book, not adding");
      showNotification("This book is already in your library.");
      return;
    }

    // 6) fetch book details from OpenLibrary
    console.log("🔍 Looking up book details online:", title);
    const lookup = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`
    ).then(r => r.json());

    const doc = lookup.docs?.[0] || {};
    const book = {
      title,
      author: doc.author_name?.join(", ") || "Unknown",
      year: doc.first_publish_year || "Unknown"
    };
    console.log("📖 Book details fetched:", book);

    // 7) save to library
    library.push(book);
    saveLibrary(library);
    console.log("✅ Book saved to library");
    showNotification("Book added to library!");
  } catch (err) {
    console.error("💥 Error during OCR fetch:", err);
    showNotification("Error: " + err.message);
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = origText;
    console.log("🔄 Extract button re-enabled");
  }
});

// === Show / Hide Library ===
showLibBtn.addEventListener("click", () => {
  console.log("📂 Toggle library view");
  const lib = getLibrary();
  libraryList.innerHTML = "";

  if (libraryList.style.display === "block") {
    libraryList.style.display = "none";
    showLibBtn.textContent = "Show Library";
    console.log("📂 Library hidden");
    return;
  }

  showLibBtn.textContent = "Hide Library";
  libraryList.style.display = "block";
  console.log("📂 Library shown");

  if (lib.length === 0) {
    console.log("📂 Library is empty");
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
    .then(() => console.log("🛠️ Service worker registered"))
    .catch(err => console.error("🛠️ SW registration failed:", err));
}
