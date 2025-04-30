// === Config & Keys ===
const BACKEND_URL   = "https://your-backend.com/proxy-google-vision";
const FILTER_URL    = "https://your-backend.com/filter-title";
const LIB_KEY       = "biblioLibrary";
const OCR_CACHE_KEY = "ocrCache";

// === DOM refs ===
const cameraInput    = document.getElementById("cameraInput");
const uploadInput    = document.getElementById("uploadInput");
const previewImage   = document.getElementById("previewImage");
const extractBtn     = document.getElementById("extractBtn");
const showLibBtn     = document.getElementById("showLibBtn");
const addBooksBtn    = document.getElementById("addBooksBtn");
const backBtn        = document.getElementById("backBtn");
const notification   = document.getElementById("notification");
const libraryList    = document.getElementById("libraryList");
const loadingOverlay = document.getElementById("loadingOverlay");

// === Storage Helpers ===
const getLibrary  = () => JSON.parse(localStorage.getItem(LIB_KEY)   || "[]");
const saveLibrary = lib => localStorage.setItem(LIB_KEY, JSON.stringify(lib));
const getCache    = () => JSON.parse(localStorage.getItem(OCR_CACHE_KEY) || "{}");
const saveCache   = c   => localStorage.setItem(OCR_CACHE_KEY, JSON.stringify(c));

// === Notification ===
function showNotification(msg) {
  notification.textContent = msg;
  notification.style.display = "block";
  setTimeout(() => notification.style.display = "none", 3000);
}

// === Library Page Initialization ===
if (libraryList) {
  renderLibrary();

  // Floating “+” button navigates to scan page
  if (addBooksBtn) {
    addBooksBtn.onclick = () => {
      window.location.href = "scan.html";
    };
  }
}

// === Render Library ===
function renderLibrary() {
  const lib = getLibrary();
  libraryList.innerHTML = "";

  if (!lib.length) {
    libraryList.textContent = "Your library is empty.";
    return;
  }

  lib.forEach((b, idx) => {
    const item = document.createElement("div");
    item.className = "book-item" + (b.read ? " read" : "");
    item.dataset.index = idx;

    item.innerHTML = `
      <div class="book-details">
        <h3>${b.title}</h3>
        <p><strong>Author:</strong> ${b.author}</p>
        <p><strong>Year:</strong> ${b.year}</p>
      </div>
      <div class="book-controls">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
        <button class="toggle-read">${b.read ? "Mark Unread" : "Mark Read"}</button>
        <div class="rating"></div>
      </div>
    `;

    libraryList.appendChild(item);

    // Delete
    item.querySelector(".delete-btn").onclick = () => {
      lib.splice(idx, 1);
      saveLibrary(lib);
      renderLibrary();
    };

    // Toggle read/unread
    item.querySelector(".toggle-read").onclick = () => {
      b.read = !b.read;
      saveLibrary(lib);
      renderLibrary();
    };

    // Stars rating
    const ratingDiv = item.querySelector(".rating");
    for (let i = 1; i <= 5; i++) {
      const star = document.createElement("span");
      star.textContent = i <= b.rating ? "★" : "☆";
      star.className = i <= b.rating ? "filled" : "empty";
      star.onclick = () => {
        b.rating = i;
        saveLibrary(lib);
        renderLibrary();
      };
      ratingDiv.appendChild(star);
    }

    // Edit
    item.querySelector(".edit-btn").onclick = () => {
      enterEditMode(item, b, idx);
    };
  });
}

// === In-place Edit Mode ===
function enterEditMode(item, book, idx) {
  const det = item.querySelector(".book-details");
  const ctr = item.querySelector(".book-controls");
  det.style.display = ctr.style.display = "none";

  const form = document.createElement("div");
  form.className = "edit-form";
  form.innerHTML = `
    <p><input class="edit-title"  value="${book.title}"  /></p>
    <p><input class="edit-author" value="${book.author}" /></p>
    <p><input class="edit-year"   value="${book.year}"   /></p>
    <div class="edit-buttons">
      <button class="save-btn">Save</button>
      <button class="cancel-btn">Cancel</button>
    </div>
  `;
  item.appendChild(form);

  // Save
  form.querySelector(".save-btn").onclick = () => {
    book.title  = form.querySelector(".edit-title").value.trim()  || book.title;
    book.author = form.querySelector(".edit-author").value.trim() || book.author;
    book.year   = form.querySelector(".edit-year").value.trim()   || book.year;
    const lib = getLibrary();
    lib[idx] = book;
    saveLibrary(lib);
    renderLibrary();
  };

  // Cancel
  form.querySelector(".cancel-btn").onclick = () => {
    renderLibrary();
  };
}

// === Scan Page Logic ===
if (extractBtn) {
  // File picker helpers
  function openCamera()  { cameraInput.click(); }
  function openLibrary() { uploadInput.click(); }

  [cameraInput, uploadInput].forEach(inp => {
    inp.onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        previewImage.src = reader.result;
        previewImage.style.display = "block";
        extractBtn.disabled = false;
      };
      reader.readAsDataURL(f);
    };
  });

  // Main “extract” flow
  extractBtn.onclick = async () => {
    extractBtn.disabled = true;
    const origText = extractBtn.textContent;
    extractBtn.textContent = "Scanning…";
    loadingOverlay.classList.add("show");

    try {
      // 1) OCR (or cached)
      const base64 = previewImage.src.split(",")[1];
      const cache = getCache();
      let lines = cache[base64];
      if (!lines) {
        const ocrRes = await fetch(BACKEND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64 }),
        });
        if (!ocrRes.ok) throw new Error("OCR failed: " + ocrRes.status);
        const ocrJson = await ocrRes.json();
        const rawText = ocrJson.fullTextAnnotation?.text || ocrJson.text || "";
        lines = rawText.split("\n").map(l => l.trim()).filter(l => l);
        cache[base64] = lines;
        saveCache(cache);
      }

      // 2) Ask LLM for JSON array of titles
      let titles = [];
      try {
        const filterRes = await fetch(FILTER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: lines.join("\n") })
        });
        const { titles: got } = await filterRes.json();
        titles = Array.isArray(got) && got.length ? got : lines;
      } catch (_) {
        titles = lines;
      }

      // 3) Add each title separately
      const lib = getLibrary();
      let anyAdded = false;
      for (const rawTitle of titles) {
        const title = rawTitle.trim();
        if (!title) continue;
        if (lib.some(b => b.title.toLowerCase() === title.toLowerCase())) continue;

        // OpenLibrary lookup
        let author = "Unknown", year = "Unknown";
        try {
          const look = await fetch(
            `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`
          ).then(r => r.json());
          const doc = look.docs?.[0];
          if (doc) {
            author = doc.author_name?.join(", ") || author;
            year   = doc.first_publish_year || year;
          }
        } catch (_) {}

        lib.push({ title, author, year, read: false, rating: 0 });
        anyAdded = true;
      }

      if (anyAdded) {
        saveLibrary(lib);
        showNotification("✅ Added new book(s)!");
      } else {
        showNotification("ℹ️  No new books found.");
      }
    } catch (err) {
      console.error(err);
      showNotification("❌ " + err.message);
    } finally {
      extractBtn.disabled = false;
      extractBtn.textContent = origText;
      loadingOverlay.classList.remove("show");
    }
  };

  // Back‐button on scan page
  if (backBtn) {
    backBtn.onclick = () => window.location.href = "index.html";
  }
}

// === Service Worker ===
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(console.warn);
}
