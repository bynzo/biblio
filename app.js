// ——— Configuration ———
const BACKEND_URL = "https://biblio-c1en.onrender.com/proxy-google-vision";
const FILTER_URL  = "https://biblio-c1en.onrender.com/filter-title";
const LIB_KEY     = "biblioLibrary";
const OCR_CACHE   = "ocrCache";

// ——— DOM refs ———
// (shared between index.html and scan.html)
const cameraInput    = document.getElementById("cameraInput");
const uploadInput    = document.getElementById("uploadInput");
const previewImage   = document.getElementById("previewImage");
const extractBtn     = document.getElementById("extractBtn");
const manualBtn      = document.getElementById("manualBtn");
const backBtn        = document.getElementById("backBtn");
const manualForm     = document.getElementById("manualForm");
const manualTitle    = document.getElementById("manualTitle");
const manualAuthor   = document.getElementById("manualAuthor");
const manualYear     = document.getElementById("manualYear");
const manualSaveBtn  = document.getElementById("manualSaveBtn");
const manualCancelBtn= document.getElementById("manualCancelBtn");
const addBooksBtn    = document.getElementById("addBooksBtn");
const libraryList    = document.getElementById("libraryList");
const notification   = document.getElementById("notification");
const loadingOv      = document.getElementById("loadingOverlay");

// ——— Storage helpers ———
const getLibrary  = () => JSON.parse(localStorage.getItem(LIB_KEY)   || "[]");
const saveLibrary = lib => localStorage.setItem(LIB_KEY, JSON.stringify(lib));
const getCache    = () => JSON.parse(localStorage.getItem(OCR_CACHE) || "{}");
const saveCache   = c   => localStorage.setItem(OCR_CACHE, JSON.stringify(c));

// ——— Notifications ———
function showNotification(msg) {
  notification.textContent = msg;
  notification.style.display = "block";
  setTimeout(() => notification.style.display = "none", 3000);
}

// ——— Navigation Buttons ———
// index.html "＋" button → scan.html
if (addBooksBtn) {
  addBooksBtn.onclick = () => location.href = "scan.html";
}
// scan.html Back button → index.html
if (backBtn) {
  backBtn.onclick = () => location.href = "index.html";
}

// ——— Library Page ———
if (libraryList) {
  renderLibrary();
}
function renderLibrary() {
  const lib = getLibrary();
  libraryList.innerHTML = "";
  if (!lib.length) {
    libraryList.textContent = "Your library is empty.";
    return;
  }
  lib.forEach((book, i) => {
    const card = document.createElement("div");
    card.className = "book-item" + (book.read ? " read" : "");
    card.innerHTML = `
      <div class="book-details">
        <h3>${book.title}</h3>
        <p><strong>Author:</strong> ${book.author}</p>
        <p><strong>Year:</strong> ${book.year}</p>
      </div>
      <div class="book-controls">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
        <button class="toggle-read">${book.read ? "Mark Unread" : "Mark Read"}</button>
        <div class="rating"></div>
      </div>
    `;
    libraryList.appendChild(card);

    // Delete
    card.querySelector(".delete-btn").onclick = () => {
      lib.splice(i, 1);
      saveLibrary(lib);
      renderLibrary();
    };

    // Toggle read/unread
    card.querySelector(".toggle-read").onclick = () => {
      book.read = !book.read;
      saveLibrary(lib);
      renderLibrary();
    };

    // Star rating
    const stars = card.querySelector(".rating");
    for (let n = 1; n <= 5; n++) {
      const s = document.createElement("span");
      s.textContent = n <= book.rating ? "★" : "☆";
      s.className = n <= book.rating ? "filled" : "empty";
      s.onclick = () => {
        book.rating = n;
        saveLibrary(lib);
        renderLibrary();
      };
      stars.appendChild(s);
    }

    // Edit
    card.querySelector(".edit-btn").onclick = () => enterEditMode(card, book, i);
  });
}

function enterEditMode(card, book, idx) {
  const details = card.querySelector(".book-details");
  const ctrls   = card.querySelector(".book-controls");
  details.style.display = ctrls.style.display = "none";

  const form = document.createElement("div");
  form.className = "edit-form";
  form.innerHTML = `
    <p><input class="edit-title"  value="${book.title}" /></p>
    <p><input class="edit-author" value="${book.author}" /></p>
    <p><input class="edit-year"   value="${book.year}"   /></p>
    <div class="edit-buttons">
      <button class="save-btn">Save</button>
      <button class="cancel-btn">Cancel</button>
    </div>
  `;
  card.appendChild(form);

  form.querySelector(".save-btn").onclick = () => {
    book.title  = form.querySelector(".edit-title").value.trim()  || book.title;
    book.author = form.querySelector(".edit-author").value.trim() || book.author;
    book.year   = form.querySelector(".edit-year").value.trim()   || book.year;
    const lib = getLibrary();
    lib[idx] = book;
    saveLibrary(lib);
    renderLibrary();
  };
  form.querySelector(".cancel-btn").onclick = () => renderLibrary();
}

// ——— Scan & OCR Flow ———
if (extractBtn) {
  // hide manual form until needed
  if (manualForm) manualForm.style.display = "none";

  // helper to trigger file pickers
  window.openCamera  = () => cameraInput.click();
  window.openLibrary = () => uploadInput.click();

  // when a file is chosen…
  [cameraInput, uploadInput].forEach(inp => {
    inp.onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        previewImage.src = reader.result;
        previewImage.style.display = "block";
        extractBtn.style.display = "inline-block";
        if (manualForm) manualForm.style.display = "none";
      };
      reader.readAsDataURL(f);
    };
  });

  // Extract Info
  extractBtn.onclick = async () => {
    extractBtn.disabled = true;
    const orig = extractBtn.textContent;
    extractBtn.textContent = "Scanning…";
    loadingOv.classList.add("show");

    try {
      // 1) OCR (cached)
      const b64 = previewImage.src.split(",")[1];
      const cache = getCache();
      let lines = cache[b64];
      if (!lines) {
        const res = await fetch(BACKEND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: b64 })
        });
        if (!res.ok) throw new Error("OCR error " + res.status);
        const o = await res.json();
        const raw = o.fullTextAnnotation?.text || o.text || "";
        lines = raw.split("\n").map(l=>l.trim()).filter(l=>l);
        cache[b64] = lines;
        saveCache(cache);
      }

      // 2) GPT filter
      let titles;
      try {
        const r = await fetch(FILTER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: lines.join("\n") })
        });
        const j = await r.json();
        titles = Array.isArray(j.titles) ? j.titles : [j.title || ""];
      } catch (_) {
        titles = lines;
      }

      // 3) lookup + add
      const lib = getLibrary();
      let added = false;
      for (let t of titles) {
        t = t.trim();
        if (!t || lib.some(b=>b.title.toLowerCase()===t.toLowerCase())) continue;
        let author="Unknown", year="Unknown";
        try {
          const r = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(t)}&limit=1`);
          const j = await r.json();
          const d = j.docs?.[0];
          if (d) {
            author = d.author_name?.join(", ") || author;
            year   = d.first_publish_year || year;
          }
        } catch {}
        lib.push({ title: t, author, year, read: false, rating: 0 });
        added = true;
      }

      if (added) {
        saveLibrary(lib);
        showNotification("✅ Added new book(s)!");
      } else {
        showNotification("ℹ️ No new books found.");
      }

    } catch (err) {
      console.error(err);
      showNotification("❌ " + err.message);
    } finally {
      extractBtn.disabled = false;
      extractBtn.textContent = orig;
      loadingOv.classList.remove("show");
    }
  };

  // Manual entry
  if (manualBtn && manualForm && manualSaveBtn && manualCancelBtn) {
    manualBtn.onclick = () => {
      previewImage.style.display = "none";
      extractBtn.style.display = "none";
      manualForm.style.display = "block";
    };
    manualSaveBtn.onclick = () => {
      const t = manualTitle.value.trim();
      if (!t) return showNotification("Please enter a title.");
      const a = manualAuthor.value.trim() || "Unknown";
      const y = manualYear.value.trim()   || "Unknown";
      const lib = getLibrary();
      lib.push({ title: t, author: a, year: y, read: false, rating: 0 });
      saveLibrary(lib);
      showNotification("✅ Added manually!");
      location.href = "index.html";
    };
    manualCancelBtn.onclick = () => manualForm.style.display = "none";
  }
}

// ——— Service Worker ———
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(console.warn);
}
