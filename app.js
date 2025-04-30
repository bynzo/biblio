// === Configuration ===
const BACKEND_URL = "https://biblio-c1en.onrender.com/proxy-google-vision";
const libraryKey = "biblioLibrary";

// === DOM References ===
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
  return JSON.parse(localStorage.getItem(libraryKey) || "[]");
}

function saveLibrary(lib) {
  localStorage.setItem(libraryKey, JSON.stringify(lib));
}

// === File Pickers ===
function openCamera() {
  cameraInput.click();
}
function openLibrary() {
  uploadInput.click();
}
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

// === Extract & Save Book ===
extractBtn.addEventListener("click", async () => {
  if (!previewImage.src) {
    showNotification("Please choose an image first.");
    return;
  }
  showNotification("Processing image…");
  try {
    // 1) Send image to OCR backend
    const base64 = previewImage.src.split(",")[1];
    const ocrRes = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64 })
    }).then(r => r.json());

    // 2) Extract first non-blank line
    const text = ocrRes.responses?.[0]?.fullTextAnnotation?.text || "";
    const title = text.split("\n").find(l => l.trim())?.trim();
    if (!title) {
      showNotification("No text found in image.");
      return;
    }
    recognizedTitle.innerHTML = `<strong>Title:</strong> ${title}`;

    // 3) Check library for duplicates
    const library = getLibrary();
    if (library.some(b => b.title.toLowerCase() === title.toLowerCase())) {
      showNotification("This book is already in your library.");
      return;
    }

    // 4) Fetch book details from OpenLibrary
    const booksData = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`
    ).then(r => r.json());

    const doc = booksData.docs?.[0];
    const book = {
      title,
      author: doc?.author_name?.join(", ") || "Unknown",
      year: doc?.first_publish_year || "Unknown"
    };

    // 5) Save to localStorage
    library.push(book);
    saveLibrary(library);
    showNotification("Book added to library!");

  } catch (err) {
    console.error(err);
    showNotification("Error: " + err.message);
  }
});

// === Show / Hide Library ===
showLibBtn.addEventListener("click", () => {
  const lib = getLibrary();
  libraryList.innerHTML = ""; // clear
  if (libraryList.style.display === "block") {
    libraryList.style.display = "none";
    showLibBtn.textContent = "Show Library";
    return;
  }
  showLibBtn.textContent = "Hide Library";
  libraryList.style.display = "block";

  if (lib.length === 0) {
    libraryList.textContent = "Your library is empty.";
    return;
  }

  lib.forEach(b => {
    const item = document.createElement("div");
    item.className = "book-item";
    item.innerHTML = `
      <h3>${b.title}</h3>
      <p><strong>Author:</strong> ${b.author}</p>
      <p><strong>Year:</strong> ${b.year}</p>
    `;
    libraryList.appendChild(item);
  });
});

// === Register SW (unchanged) ===
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}
