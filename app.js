// === Config & Keys ===
const BACKEND_URL   = "https://biblio-c1en.onrender.com/proxy-google-vision";
const LIB_KEY       = "biblioLibrary";
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

// expose for inline buttons
window.openCamera      = () => cameraInput.click();
window.openLibrary     = () => uploadInput.click();

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

// === OCR + Add Book ===
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
    const base64 = dataUrl.split(",")[1];
    const cache = getOcrCache();
    let title = cache[base64];

    if (!title) {
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 })
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = await res.json();
      const fullText = json.text
                    || json.fullTextAnnotation?.text
                    || "";
      const lines = fullText
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length);
      title = lines[0] || "";
      if (!title) {
        showNotification("No text found in image.");
        return;
      }
      cache[base64] = title;
      saveOcrCache(cache);
    }

    recognizedTitle.innerHTML = `<strong>Title:</strong> ${title}`;

    // build new book object
    const library = getLibrary();
    if (library.some(b => b.title.toLowerCase() === title.toLowerCase())) {
      showNotification("This book is already in your library.");
      return;
    }

    // fetch metadata
    const lookup = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`
    ).then(r => r.json());

    const doc = lookup.docs?.[0] || {};
    const book = {
      title,
      author: doc.author_name?.join(", ") || "Unknown",
      year:   doc.first_publish_year || "Unknown",
      read:   false,
      notes:  ""
    };

    library.push(book);
    saveLibrary(library);
    showNotification("Book added to library!");
  }
  catch (err) {
    console.error(err);
    showNotification("Error: " + err.message);
  }
  finally {
    extractBtn.disabled  = false;
    extractBtn.textContent = origText;
  }
});

// === Library Rendering & Actions ===
function renderLibrary() {
  const lib = getLibrary();
  if (lib.length === 0) {
    libraryList.innerHTML = `<p>Your library is empty.</p>`;
    return;
  }

  libraryList.innerHTML = lib.map((b,i) => `
    <div class="book-item" data-index="${i}">
      <h3>${b.title}</h3>
      <p><strong>Author:</strong> ${b.author}</p>
      <p><strong>Year:</strong> ${b.year}</p>
      <p><strong>Notes:</strong> ${b.notes || "<em>(none)</em>"}</p>
      <div class="book-controls">
        <label>
          <input type="checkbox" class="read-checkbox" ${b.read ? "checked" : ""}>
          Read
        </label>
        <button class="edit-note-btn">Edit Notes</button>
        <button class="delete-btn">Delete</button>
      </div>
    </div>
  `).join("");

  // hook up all buttons & checkboxes
  libraryList.querySelectorAll(".delete-btn")
    .forEach(btn => btn.addEventListener("click", () => {
      const idx = +btn.closest(".book-item").dataset.index;
      const lib = getLibrary();
      lib.splice(idx,1);
      saveLibrary(lib);
      renderLibrary();
    }));

  libraryList.querySelectorAll(".read-checkbox")
    .forEach(cb => cb.addEventListener("change", () => {
      const idx = +cb.closest(".book-item").dataset.index;
      const lib = getLibrary();
      lib[idx].read = cb.checked;
      saveLibrary(lib);
    }));

  libraryList.querySelectorAll(".edit-note-btn")
    .forEach(btn => btn.addEventListener("click", () => {
      const idx = +btn.closest(".book-item").dataset.index;
      const lib = getLibrary();
      const newNotes = prompt("Edit notes for:\n" + lib[idx].title, lib[idx].notes);
      if (newNotes !== null) {
        lib[idx].notes = newNotes;
        saveLibrary(lib);
        renderLibrary();
      }
    }));
}

// Show/hide library
showLibBtn.addEventListener("click", () => {
  if (libraryList.style.display === "block") {
    libraryList.style.display = "none";
    showLibBtn.textContent = "Show Library";
  } else {
    renderLibrary();
    libraryList.style.display = "block";
    showLibBtn.textContent = "Hide Library";
  }
});

// === Service Worker ===
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js")
    .catch(console.error);
}
