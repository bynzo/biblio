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

// === Storage Helpers ===
const getLibrary  = () => JSON.parse(localStorage.getItem(LIB_KEY)   || "[]");
const saveLibrary = lib => localStorage.setItem(LIB_KEY, JSON.stringify(lib));
const getCache    = () => JSON.parse(localStorage.getItem(OCR_CACHE_KEY) || "{}");
const saveCache   = c   => localStorage.setItem(OCR_CACHE_KEY, JSON.stringify(c));

// === Notifications ===
function showNotification(msg) {
  notification.textContent = msg;
  notification.style.display = "block";
  setTimeout(() => notification.style.display = "none", 3000);
}

// === File Pickers ===
function openCamera()  { cameraInput.click(); }
function openLibrary() { uploadInput.click(); }

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

// === OCR & Book Addition ===
extractBtn.addEventListener("click", async () => {
  const dataUrl = previewImage.src;
  if (!dataUrl) return showNotification("Please select an image first.");

  extractBtn.disabled = true;
  const originalText = extractBtn.textContent;
  extractBtn.textContent = "Scanning…";

  try {
    const base64 = dataUrl.split(",")[1];
    let lines;

    // 1) Try cache
    const cache = getCache();
    if (cache[base64]) {
      lines = cache[base64];
    } else {
      // 2) Call Vision API
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 })
      });
      if (!res.ok) throw new Error("Server returned " + res.status);
      const json = await res.json();
      const full = json.fullTextAnnotation?.text || json.text || "";
      lines = full.split("\n").map(l=>l.trim()).filter(l=>l);
      if (!lines.length) throw new Error("No text found in image");
      cache[base64] = lines;
      saveCache(cache);
    }

    // 3) Loop each line as title
    const library = getLibrary();
    let anyAdded = false;

    for (const title of lines) {
      if (library.some(b => b.title.toLowerCase()===title.toLowerCase())) {
        console.log("Skipping duplicate:", title);
        continue;
      }
      // 4) OpenLibrary lookup
      let author="Unknown", year="Unknown";
      try {
        const look = await fetch(
          `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`
        ).then(r=>r.json());
        const doc = look.docs?.[0];
        if (doc) {
          author = doc.author_name?.join(", ") || author;
          year   = doc.first_publish_year || year;
        }
      } catch(e) {
        console.warn("Lookup failed for", title, e);
      }
      library.push({ title, author, year, read:false, rating:0 });
      anyAdded = true;
    }

    if (anyAdded) {
      saveLibrary(library);
      renderLibrary();
      showNotification("Added new books!");
    } else {
      showNotification("No new books found.");
    }

  } catch (err) {
    console.error(err);
    showNotification("Error: " + err.message);
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = originalText;
  }
});

// === Render / Controls ===
showLibBtn.addEventListener("click", () => {
  if (libraryList.style.display==="block") {
    libraryList.style.display = "none";
    showLibBtn.textContent = "Show Library";
  } else {
    libraryList.style.display = "block";
    showLibBtn.textContent = "Hide Library";
    renderLibrary();
  }
});

function renderLibrary(){
  libraryList.innerHTML = "";
  const lib = getLibrary();
  if (!lib.length) {
    libraryList.textContent = "Your library is empty.";
    return;
  }
  lib.forEach((b, idx) => {
    const item = document.createElement("div");
    item.className = "book-item" + (b.read?" read":"");
    item.dataset.index = idx;

    item.innerHTML = `
      <div class="book-details">
        <h3 class="book-title">${b.title}</h3>
        <p><strong>Author:</strong> <span class="book-author">${b.author}</span></p>
        <p><strong>Year:</strong> <span class="book-year">${b.year}</span></p>
      </div>
      <div class="book-controls">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
        <button class="toggle-read">${b.read? "Mark Unread":"Mark Read"}</button>
        <div class="rating"></div>
      </div>
    `;
    libraryList.appendChild(item);

    // ––– delete
    item.querySelector(".delete-btn")
        .addEventListener("click", () => {
      lib.splice(idx,1);
      saveLibrary(lib);
      renderLibrary();
    });

    // ––– toggle read/unread
    item.querySelector(".toggle-read")
        .addEventListener("click", () => {
      b.read = !b.read;
      saveLibrary(lib);
      renderLibrary();
    });

    // ––– rating stars
    const ratingDiv = item.querySelector(".rating");
    for(let i=1;i<=5;i++){
      const star = document.createElement("span");
      star.innerHTML = (i<=b.rating) ? "★":"☆";
      star.className = (i<=b.rating) ? "filled":"empty";
      star.dataset.value = i;
      star.addEventListener("click", () => {
        b.rating = Number(star.dataset.value);
        saveLibrary(lib);
        renderLibrary();
      });
      ratingDiv.appendChild(star);
    }

    // ––– edit in-place
    item.querySelector(".edit-btn")
        .addEventListener("click", () => enterEditMode(item, b, idx));
  });
}

function enterEditMode(item, book, idx){
  const titleEl  = item.querySelector(".book-title");
  const authorEl = item.querySelector(".book-author");
  const yearEl   = item.querySelector(".book-year");
  const controls = item.querySelector(".book-controls");

  // hide details and controls
  titleEl.style.display = authorEl.style.display = yearEl.style.display = "none";
  controls.style.display = "none";

  // build form
  const form = document.createElement("div");
  form.className="edit-form";
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

  // save
  form.querySelector(".save-btn")
      .addEventListener("click",() => {
    book.title  = form.querySelector(".edit-title").value.trim()  || book.title;
    book.author = form.querySelector(".edit-author").value.trim() || book.author;
    book.year   = form.querySelector(".edit-year").value.trim()   || book.year;
    const lib = getLibrary();
    lib[idx] = book;
    saveLibrary(lib);
    renderLibrary();
  });

  // cancel
  form.querySelector(".cancel-btn")
      .addEventListener("click",() => renderLibrary());
}

// === Service Worker ===
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js")
    .catch(console.warn);
}
