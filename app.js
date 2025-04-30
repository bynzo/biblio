// === Debug notice on load ===
console.log("🟢 app.js loaded");

// === Config & Keys ===
const BACKEND_URL     = "https://biblio-c1en.onrender.com/proxy-google-vision";
const LIB_KEY         = "biblioLibrary";
const OCR_CACHE_KEY   = "ocrCache";

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
function openCamera()  { cameraInput.click(); }
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
      console.log("✅ Preview ready, extract enabled");
    };
    reader.readAsDataURL(file);
  });
});

// === Extract Handler ===
extractBtn.addEventListener("click", async () => {
  console.log("🚀 Extract button clicked");
  const origText = extractBtn.textContent;
  extractBtn.disabled = true;
  extractBtn.textContent = "Scanning…";

  try {
    if (!previewImage.src) {
      throw new Error("No image to scan");
    }
    // get Base64
    const base64 = previewImage.src.split(",")[1];
    console.log("🔡 Base64 size:", base64.length);

    // OCR cache?
    const cache = getOcrCache();
    let lines = cache[base64];
    if (lines) {
      console.log("📦 Using cached lines:", lines);
    } else {
      // call your backend
      console.log("🌐 Sending to OCR backend:", BACKEND_URL);
      const resp = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 })
      });
      console.log("📶 Backend response status:", resp.status);
      if (!resp.ok) throw new Error(`OCR API returned ${resp.status}`);

      const json = await resp.json();
      console.log("📋 OCR JSON:", json);

      // grab whichever text field exists
      const raw =
        json.text
        || json.fullTextAnnotation?.text
        || json.textAnnotations?.[0]?.description
        || "";
      console.log("✂️ raw OCR text:", raw);

      // split into every non-empty line
      lines = raw
        .split("\n")
        .map(l => l.trim())
        .filter(l => l);
      console.log("📑 parsed lines:", lines);

      cache[base64] = lines;
      saveOcrCache(cache);
      console.log("✅ Cached parsed lines");
    }

    // now process each title
    const library = getLibrary();
    let added = 0;

    for (const title of lines) {
      console.log("🔍 Checking title:", title);
      // skip if exact duplicate
      if (library.some(b => b.title.toLowerCase() === title.toLowerCase())) {
        console.log("⚠️ Already in library, skipping:", title);
        continue;
      }

      // fetch OpenLibrary data but don't fail if none
      let author = "", year = "";
      try {
        const lookup = await fetch(
          `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`
        ).then(r => r.json());
        if (lookup.docs && lookup.docs.length) {
          const d = lookup.docs[0];
          author = d.author_name?.join(", ") || "";
          year   = d.first_publish_year || "";
          console.log("📚 Found OL info for", title, { author, year });
        } else {
          console.log("⚠️ No OL data for", title);
        }
      } catch (olErr) {
        console.warn("❌ OL lookup failed for", title, olErr);
      }

      // push the book even if author/year are blank
      library.push({ title, author, year });
      added++;
      console.log("➕ Added to library:", title);
    }

    if (added) {
      saveLibrary(library);
      showNotification(`Added ${added} new book${added>1?"s":""}!`);
    } else {
      showNotification("No new titles to add");
    }

    // show all scanned lines in the UI
    recognizedTitle.innerHTML = `<strong>Scanned titles:</strong><br>${lines.join("<br>")}`;

  } catch (err) {
    console.error("❗ Extraction error", err);
    showNotification("Error: " + err.message);
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = origText;
  }
});

// === Show / Hide Library ===
showLibBtn.addEventListener("click", () => {
  console.log("📂 Toggling library view");
  const lib = getLibrary();

  if (libraryList.style.display === "block") {
    libraryList.style.display = "none";
    showLibBtn.textContent = "Show Library";
    return;
  }

  libraryList.innerHTML = "";
  if (lib.length === 0) {
    libraryList.textContent = "Your library is empty.";
  } else {
    lib.forEach((b,i) => {
      const card = document.createElement("div");
      card.className = "book-item";
      card.innerHTML = `
        <h3>${b.title}</h3>
        <p><strong>Author:</strong> ${b.author||"—"}</p>
        <p><strong>Year:</strong> ${b.year||"—"}</p>
      `;
      libraryList.appendChild(card);
    });
  }

  libraryList.style.display = "block";
  showLibBtn.textContent = "Hide Library";
});
