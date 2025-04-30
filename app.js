// === Config & Keys ===
const BACKEND_URL = "https://biblio-c1en.onrender.com/proxy-google-vision";
const LIB_KEY = "biblioLibrary";
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

// === Helpers ===
function showNotification(msg) {
  console.log("🔔 Notification:", msg);
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
      console.log("🖼️ Preview image loaded, extract ready");
    };
    reader.readAsDataURL(file);
  });
});

// === Extract Handler ===
extractBtn.addEventListener("click", async () => {
  console.log("🔍 Extract button clicked");
  const origText = extractBtn.textContent;
  extractBtn.disabled = true;
  extractBtn.textContent = "Scanning…";

  try {
    // 1) get Base64
    const dataUrl = previewImage.src;
    if (!dataUrl) throw new Error("No image selected");
    console.log("📸 Preview src prefix:", dataUrl.slice(0,30), "…");
    const base64 = dataUrl.split(",")[1];
    console.log("🔡 Base64 length:", base64.length);

    // 2) OCR cache lookup
    const ocrCache = getOcrCache();
    let lines = ocrCache[base64];
    if (lines) {
      console.log("📦 Cached OCR hit, lines:", lines);
    } else {
      // 3) call backend
      console.log("🛰️ Calling OCR backend at:", BACKEND_URL);
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 })
      });
      console.log("⚙️ fetch() returned status", res.status);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const json = await res.json();
      console.log("📥 OCR response JSON:", json);

      // 4) extract the raw text block
      const fullText = json.text
                    || json.fullTextAnnotation?.text
                    || "";
      console.log("📄 Parsed fullText:", fullText);

      // 5) split into all non-empty lines
      lines = fullText
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 0);
      console.log("➡️ Parsed lines:", lines);

      // 6) cache it
      ocrCache[base64] = lines;
      saveOcrCache(ocrCache);
    }

    // 7) process each title
    const library = getLibrary();
    let addedCount = 0;

    for (const title of lines) {
      console.log("💡 Processing title:", title);
      // skip duplicates
      if (library.some(b => b.title.toLowerCase() === title.toLowerCase())) {
        console.log("⚠️ Skipping duplicate:", title);
        continue;
      }
      // fetch book info
      const lookup = await fetch(
        `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`
      ).then(r => r.json());
      const doc = lookup.docs?.[0] || {};
      const book = {
        title,
        author: doc.author_name?.join(", ") || "Unknown",
        year:   doc.first_publish_year || "Unknown"
      };
      library.push(book);
      addedCount++;
      console.log("✅ Added book:", book);
    }

    // 8) save & notify
    if (addedCount > 0) {
      saveLibrary(library);
      showNotification(`${addedCount} book${addedCount>1?"s":""} added to library!`);
    } else {
      showNotification("No new books to add.");
    }

    // 9) display all titles
    if (lines.length) {
      recognizedTitle.innerHTML =
        `<strong>Titles:</strong> ${lines.join(" | ")}`;
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
  console.log("📚 Toggle library view");
  const lib = getLibrary();

  if (libraryList.style.display === "block") {
    libraryList.style.display = "none";
    showLibBtn.textContent = "Show Library";
    return;
  }

  // build the list
  libraryList.innerHTML = "";
  if (lib.length === 0) {
    libraryList.textContent = "Your library is empty.";
  } else {
    lib.forEach((b,i) => {
      const div = document.createElement("div");
      div.className = "book-item";
      div.innerHTML = `
        <h3>${b.title}</h3>
        <p><strong>Author:</strong> ${b.author}</p>
        <p><strong>Year:</strong> ${b.year}</p>
        <div class="actions">
          <button onclick="editBook(${i})">Edit</button>
          <button onclick="deleteBook(${i})">Delete</button>
        </div>
      `;
      libraryList.appendChild(div);
    });
  }
  libraryList.style.display = "block";
  showLibBtn.textContent = "Hide Library";
});
