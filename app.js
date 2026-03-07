// ------------------------------------------------------------
// FORCE-DISABLE ZXING (kills any cached or hidden ZXing scripts)
// ------------------------------------------------------------
window.ZXing = undefined;
window.BrowserBarcodeReader = undefined;
window.BarcodeReader = undefined;

// ------------------------------------------------------------
// HTML5-QRCODE IS LOADED GLOBALLY FROM html5-qrcode.min.js
// ------------------------------------------------------------

// ------------------------------------------------------------
// ELEMENT REFERENCES
// ------------------------------------------------------------
const btnWristband = document.getElementById('btnWristband');
const btnFeed = document.getElementById('btnFeed');
const btnStop = document.getElementById('btnStop');

const cameraCard = document.getElementById('cameraCard');
const cameraTitle = document.getElementById('cameraTitle');
const statusEl = document.getElementById('status');
const videoContainer = document.getElementById('video-container');

const resultCard = document.getElementById('resultCard');
const scanTypeEl = document.getElementById('scanType');
const patientEl = document.getElementById('patient');
const motherEl = document.getElementById('mother');
const feedEl = document.getElementById('feed');
const rawEl = document.getElementById('raw');

let scanner = null;
let scanning = false;
let currentMode = "wristband";

// ------------------------------------------------------------
// BUTTON HANDLERS
// ------------------------------------------------------------
btnWristband.addEventListener("click", () => {
  currentMode = "wristband";
  cameraTitle.textContent = "Scan wristband";
  startCamera();
});

btnFeed.addEventListener("click", () => {
  currentMode = "feed";
  cameraTitle.textContent = "Scan feed label";
  startCamera();
});

btnStop.addEventListener("click", () => {
  stopCamera();
});

// ------------------------------------------------------------
// START CAMERA
// ------------------------------------------------------------
async function startCamera() {
  if (scanning) return;
  scanning = true;

  cameraCard.style.display = "block";
  statusEl.textContent = "Starting camera…";

  try {
    // Create scanner instance
    scanner = new Html5Qrcode("video-container");

    await scanner.start(
      { facingMode: "environment" },   // rear camera (iOS-safe)
      {
        fps: 10,
        qrbox: { width: 250, height: 250 }
      },
      async (decodedText) => {
        rawEl.textContent = decodedText;
        statusEl.textContent = "Scanned, sending to backend…";
        await sendToBackend(decodedText);
        stopCamera();
      },
      (errorMessage) => {
        // ignore decode errors
      }
    );

    statusEl.textContent =
      "Point camera at the " +
      (currentMode === "wristband" ? "wristband." : "feed label.");

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error starting camera: " + err;
    scanning = false;
  }
}

// ------------------------------------------------------------
// STOP CAMERA
// ------------------------------------------------------------
function stopCamera() {
  if (scanner) {
    scanner.stop().catch(() => {});
    scanner.clear();
  }
  scanning = false;
  statusEl.textContent = "Camera stopped. Choose a scan mode to start again.";
}

// ------------------------------------------------------------
// SEND TO BACKEND
// ------------------------------------------------------------
async function sendToBackend(raw) {
    try {
        const response = await fetch("https://tracefeeder-api-clean-fka7fgcwbxabgrhu.ukwest-01.azurewebsites.net/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw })
    });

    const data = await response.json();

    resultCard.style.display = "block";
    scanTypeEl.textContent = data.scanType || "";

    patientEl.textContent = data.patient
      ? `${data.patient.firstName} ${data.patient.lastName}`
      : "";

    motherEl.textContent = data.mother
      ? `${data.mother.firstName} ${data.mother.lastName}`
      : "";

    feedEl.textContent = data.feed ? data.feed.description : "";
    rawEl.textContent = raw;

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error talking to backend: " + err;
  }
}

// ------------------------------------------------------------
// SERVICE WORKER
// ------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(console.error);
  });
}