const cameraInput = document.getElementById("cameraInput");
const uploadInput = document.getElementById("uploadInput");
const previewImage = document.getElementById("previewImage");
const extractBtn = document.getElementById("extractBtn");
const recognizedTitle = document.getElementById("recognizedTitle");
const notification = document.getElementById("notification");

// Functions to open file pickers
function openCamera() {
  cameraInput.click();
}

function openLibrary() {
  uploadInput.click();
}

// Handle image selection
function handleImage(file) {
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      previewImage.src = reader.result;
      previewImage.style.display = "block";
      extractBtn.disabled = false;
    };
    reader.readAsDataURL(file);
  }
}

cameraInput.addEventListener("change", (e) => {
  handleImage(e.target.files[0]);
});

uploadInput.addEventListener("change", (e) => {
  handleImage(e.target.files[0]);
});

// Handle title extraction
extractBtn.addEventListener("click", async () => {
  if (!previewImage.src) {
    showNotification("Please upload an image first.");
    return;
  }

  if (!navigator.onLine) {
    showNotification("Offline mode: OCR not available.");
    return;
  }

  showNotification("Sending image to Google OCR...");

  const base64 = previewImage.src.split(",")[1];
  const apiKey = "AIzaSyCLy5EwYvgGQUSlTuXKyO0-A6pnKQCoIQY"; // <-- Don't forget to replace later

  try {
    const response = await fetch(
      "/proxy-google-vision",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, key: apiKey }),
      }
    );

    const data = await response.json();
    const text = data.responses?.[0]?.fullTextAnnotation?.text || "No text found.";
    const firstLine = text.split("\n").find((line) => line.trim());

    recognizedTitle.innerHTML = `<strong>Title:</strong> ${firstLine || "No text found"}`;

    showNotification("Text extracted!");

    if (firstLine) {
      const bookRes = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(firstLine)}`);
      const bookData = await bookRes.json();

      if (bookData.docs?.[0]) {
        const book = bookData.docs[0];
        recognizedTitle.innerHTML += `
          <br><strong>Author:</strong> ${book.author_name?.join(', ') || 'Unknown'}
          <br><strong>Year:</strong> ${book.first_publish_year || 'Unknown'}
        `;
      }
    }
  } catch (error) {
    showNotification("Error during OCR: " + error.message);
  }
});

function showNotification(message) {
  notification.textContent = message;
  notification.style.display = "block";
  setTimeout(() => {
    notification.style.display = "none";
  }, 3000);
}

// Register Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}
