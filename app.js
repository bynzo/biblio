// === Config & Keys ===
const BACKEND_URL     = "https://biblio-c1en.onrender.com/proxy-google-vision";
const FILTER_URL      = "https://biblio-c1en.onrender.com/filter-title";
const LIB_KEY         = "biblioLibrary";
const OCR_CACHE_KEY   = "ocrCache";

// === DOM refs ===
const cameraInput    = document.getElementById("cameraInput");
const uploadInput    = document.getElementById("uploadInput");
const previewImage   = document.getElementById("previewImage");
const extractBtn     = document.getElementById("extractBtn");
const notification   = document.getElementById("notification");
const libraryList    = document.getElementById("libraryList");
const addBooksBtn    = document.getElementById("addBooksBtn");
const backBtn        = document.getElementById("backBtn");
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

// ————— Library Page —————
if (libraryList) {
  renderLibrary();
  if (addBooksBtn) {
    addBooksBtn.onclick = () => window.location.href = "scan.html";
  }
}

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
    item.innerHTML = `
      <div class="book-details">
        <h3>${b.title}</h3>
        <p><strong>Author:</strong> ${b.author}</p>
        <p><strong>Year:</strong> ${b.year}</p>
      </div>
      <div class="book-controls">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
        <button class="toggle-read">${b.read ? "Mark Unread":"Mark Read"}</button>
        <div class="rating"></div>
      </div>
    `;
    libraryList.appendChild(item);

    // Delete
    item.querySelector(".delete-btn").onclick = () => {
      lib.splice(idx,1);
      saveLibrary(lib);
      renderLibrary();
    };

    // Toggle
    item.querySelector(".toggle-read").onclick = () => {
      b.read = !b.read;
      saveLibrary(lib);
      renderLibrary();
    };

    // Rating
    const ratingDiv = item.querySelector(".rating");
    for (let i=1; i<=5; i++) {
      const star = document.createElement("span");
      star.textContent = i<=b.rating ? "★":"☆";
      star.className = i<=b.rating ? "filled":"empty";
      star.onclick = () => {
        b.rating = i;
        saveLibrary(lib);
        renderLibrary();
      };
      ratingDiv.appendChild(star);
    }

    // Edit
    item.querySelector(".edit-btn").onclick = () => enterEditMode(item, b, idx);
  });
}

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
    <div>
      <button class="save-btn">Save</button>
      <button class="cancel-btn">Cancel</button>
    </div>
  `;
  item.appendChild(form);

  form.querySelector(".save-btn").onclick = () => {
    book.title  = form.querySelector(".edit-title").value.trim()  || book.title;
    book.author = form.querySelector(".edit-author").value.trim() || book.author;
    book.year   = form.querySelector(".edit-year").value.trim()   || book.year;
    const lib = getLibrary();
    lib[idx] = book;
    saveLibrary(lib);
    renderLibrary();
  };

  form.querySelector(".cancel-btn").onclick = () => {
    renderLibrary();
  };
}

// ————— Scan Page —————
if (extractBtn) {
  // File pickers
  function openCamera()  { cameraInput.click(); }
  function openLibrary() { uploadInput.click(); }
  [cameraInput, uploadInput].forEach(inp => {
    inp.onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        previewImage.src = r.result;
        previewImage.style.display = "block";
        extractBtn.disabled = false;
      };
      r.readAsDataURL(f);
    };
  });

  // OCR + GPT filter + OpenLibrary lookup
  extractBtn.onclick = async () => {
    extractBtn.disabled = true;
    const orig = extractBtn.textContent;
    extractBtn.textContent = "Scanning…";
    loadingOverlay.classList.add("show");

    try {
      const fullBase64 = previewImage.src.split(",")[1];
      let lines = getCache()[fullBase64];
      if (!lines) {
        const ocrRes = await fetch(BACKEND_URL, {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ image: fullBase64 })
        });
        if (!ocrRes.ok) throw new Error("OCR failed: " + ocrRes.status);
        const ocrJson = await ocrRes.json();
        const raw   = ocrJson.fullTextAnnotation?.text || ocrJson.text || "";
        lines = raw.split("\n").map(l=>l.trim()).filter(l=>l);
        const cache = getCache();
        cache[fullBase64] = lines;
        saveCache(cache);
      }

      const lib = getLibrary();
      let anyAdded = false;

      for (let rawTitle of lines) {
        // call GPT filter
        let title = rawTitle;
        try {
          const filterRes = await fetch(FILTER_URL, {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ text: lines.join("\n") })
          });
          const filJ = await filterRes.json();
          if (filJ.title) title = filJ.title;
        } catch(_) {
          // fallback to rawTitle
        }

        if (lib.some(b=>b.title.toLowerCase()===title.toLowerCase())) continue;

        // lookup OpenLibrary
        let author="Unknown", year="Unknown";
        try {
          const look = await fetch(
            `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`
          ).then(r=>r.json());
          const d = look.docs?.[0];
          if (d) {
            author = d.author_name?.join(", ") || author;
            year   = d.first_publish_year || year;
          }
        } catch(_) {}

        lib.push({ title, author, year, read:false, rating:0 });
        anyAdded = true;
      }

      if (anyAdded) {
        saveLibrary(lib);
        showNotification("Books added!");
      } else {
        showNotification("No new books.");
      }
    } catch (err) {
      console.error(err);
      showNotification("Error: " + err.message);
    } finally {
      extractBtn.disabled = false;
      extractBtn.textContent = orig;
      loadingOverlay.classList.remove("show");
    }
  };

  // Back button
  if (backBtn) {
    backBtn.onclick = () => window.location.href = "index.html";
  }
}

// === Service Worker ===
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(console.warn);
}
