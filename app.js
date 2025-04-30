// === Config & Keys ===
const BACKEND_URL   = "https://biblio-c1en.onrender.com/proxy-google-vision";
const LIB_KEY       = "biblioLibrary";
const OCR_CACHE_KEY = "ocrCache";

// DOM refs (some pages won’t have all of these)
const cameraInput     = document.getElementById("cameraInput");
const uploadInput     = document.getElementById("uploadInput");
const previewImage    = document.getElementById("previewImage");
const extractBtn      = document.getElementById("extractBtn");
const notification    = document.getElementById("notification");
const libraryList     = document.getElementById("libraryList");
const addBooksBtn     = document.getElementById("addBooksBtn");
const backBtn         = document.getElementById("backBtn");

// storage
const getLibrary  = () => JSON.parse(localStorage.getItem(LIB_KEY)   || "[]");
const saveLibrary = l => localStorage.setItem(LIB_KEY, JSON.stringify(l));
const getCache    = () => JSON.parse(localStorage.getItem(OCR_CACHE_KEY) || "{}");
const saveCache   = c => localStorage.setItem(OCR_CACHE_KEY, JSON.stringify(c));

function showNotification(msg) {
  notification.textContent = msg;
  notification.style.display = "block";
  setTimeout(()=>notification.style.display="none",3000);
}

// —————————— Library Page Logic ——————————
if (libraryList) {
  // render on load
  renderLibrary();

  // floating “+” goes to scan page
  addBooksBtn.addEventListener("click", ()=>{
    window.location.href = "scan.html";
  });
}

function renderLibrary(){
  const lib = getLibrary();
  libraryList.innerHTML = "";
  if (!lib.length) {
    libraryList.textContent = "Your library is empty.";
    return;
  }
  lib.forEach((b, idx) => {
    const item = document.createElement("div");
    item.className = "book-item" + (b.read?" read":"");
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

    // delete
    item.querySelector(".delete-btn")
      .addEventListener("click", ()=>{
        lib.splice(idx,1);
        saveLibrary(lib);
        renderLibrary();
      });

    // toggle read
    item.querySelector(".toggle-read")
      .addEventListener("click", ()=>{
        b.read = !b.read;
        saveLibrary(lib);
        renderLibrary();
      });

    // rating
    const ratingDiv = item.querySelector(".rating");
    for(let i=1; i<=5; i++){
      const star = document.createElement("span");
      star.textContent = i<=b.rating ? "★":"☆";
      star.className   = i<=b.rating ? "filled":"empty";
      star.dataset.val = i;
      star.addEventListener("click", ()=>{
        b.rating = Number(star.dataset.val);
        saveLibrary(lib);
        renderLibrary();
      });
      ratingDiv.appendChild(star);
    }

    // edit
    item.querySelector(".edit-btn")
      .addEventListener("click", ()=> enterEditMode(item,b,idx));
  });
}

function enterEditMode(item, book, idx){
  const d = item.querySelector(".book-details");
  const c = item.querySelector(".book-controls");
  d.style.display = c.style.display = "none";

  const form = document.createElement("div");
  form.className = "edit-form";
  form.innerHTML = `
    <p><input class="edit-title"  value="${book.title}" /></p>
    <p><input class="edit-author" value="${book.author}" /></p>
    <p><input class="edit-year"   value="${book.year}"   /></p>
    <div>
      <button class="save-btn">Save</button>
      <button class="cancel-btn">Cancel</button>
    </div>
  `;
  item.appendChild(form);

  form.querySelector(".save-btn")
    .addEventListener("click", ()=>{
      book.title  = form.querySelector(".edit-title").value.trim()  || book.title;
      book.author = form.querySelector(".edit-author").value.trim() || book.author;
      book.year   = form.querySelector(".edit-year").value.trim()   || book.year;
      const lib = getLibrary();
      lib[idx] = book;
      saveLibrary(lib);
      renderLibrary();
    });
  form.querySelector(".cancel-btn")
    .addEventListener("click", ()=> renderLibrary());
}

// —————————— Scan Page Logic ——————————
if (extractBtn) {
  // wire up file pickers
  function openCamera()  { cameraInput.click(); }
  function openLibrary() { uploadInput.click(); }
  [cameraInput, uploadInput].forEach(inp=>{
    inp.addEventListener("change", e=>{
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        previewImage.src = reader.result;
        previewImage.style.display = "block";
        extractBtn.disabled = false;
      };
      reader.readAsDataURL(file);
    });
  });

  // OCR & add
  extractBtn.addEventListener("click", async ()=>{
    extractBtn.disabled = true;
    const orig = extractBtn.textContent;
    extractBtn.textContent = "Scanning…";
    try {
      const base64 = previewImage.src.split(",")[1];
      let lines = getCache()[base64];
      if (!lines) {
        const res = await fetch(BACKEND_URL, {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({image:base64})
        });
        if (!res.ok) throw new Error("Server "+res.status);
        const js  = await res.json();
        const txt = js.fullTextAnnotation?.text || js.text || "";
        lines = txt.split("\n").map(l=>l.trim()).filter(l=>l);
        const c = getCache(); c[base64]=lines; saveCache(c);
      }
      const lib = getLibrary();
      let added=false;
      for (const title of lines) {
        if (lib.some(b=>b.title.toLowerCase()===title.toLowerCase())) continue;
        let author="Unknown", year="Unknown";
        try {
          const look = await fetch(
            `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`
          ).then(r=>r.json());
          const d = look.docs?.[0];
          if (d){
            author = d.author_name?.join(", ")||author;
            year   = d.first_publish_year||year;
          }
        } catch(e){/*ignore*/}
        lib.push({title,author,year,read:false,rating:0});
        added=true;
      }
      if (added){
        saveLibrary(lib);
        showNotification("Books added!"); 
      } else {
        showNotification("No new books.");
      }
    } catch(err){
      console.error(err);
      showNotification("Error: "+err.message);
    } finally {
      extractBtn.disabled = false;
      extractBtn.textContent = orig;
    }
  });
}

// back button on scan page
if (backBtn) {
  backBtn.addEventListener("click", ()=>{
    window.location.href = "index.html";
  });
}

// service worker (shared)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(console.warn);
}
