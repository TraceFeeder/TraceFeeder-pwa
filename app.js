const btnWristband = document.getElementById('btnWristband');
const btnFeed = document.getElementById('btnFeed');
const btnStop = document.getElementById('btnStop');

const cameraCard = document.getElementById('cameraCard');
const cameraTitle = document.getElementById('cameraTitle');
const statusEl = document.getElementById('status');
const video = document.getElementById('video');

const resultCard = document.getElementById('resultCard');
const scanTypeEl = document.getElementById('scanType');
const patientEl = document.getElementById('patient');
const motherEl = document.getElementById('mother');
const feedEl = document.getElementById('feed');
const rawEl = document.getElementById('raw');

let codeReader = null;
let scanning = false;
let currentMode = 'wristband';

// ---------------- BUTTON HANDLERS ----------------

btnWristband.addEventListener('click', () => {
  currentMode = 'wristband';
  cameraTitle.textContent = 'Scan wristband';
  startCamera();
});

btnFeed.addEventListener('click', () => {
  currentMode = 'feed';
  cameraTitle.textContent = 'Scan feed label';
  startCamera();
});

btnStop.addEventListener('click', () => {
  stopCamera();
});

// ---------------- CAMERA START ----------------

async function startCamera() {
  if (scanning) return;
  scanning = true;

  cameraCard.style.display = 'block';
  statusEl.textContent = 'Starting camera…';

  try {
    // Force iOS to show camera permission popup
    await navigator.mediaDevices.getUserMedia({ video: true });

    codeReader = new ZXing.BrowserMultiFormatReader();
    const devices = await codeReader.listVideoInputDevices();

    if (!devices || devices.length === 0) {
      statusEl.textContent = 'No camera found.';
      statusEl.classList.add('error');
      scanning = false;
      return;
    }

    const deviceId = devices[0].deviceId;

    await codeReader.decodeFromVideoDevice(deviceId, video, async (result, err) => {
      if (result) {
        const raw = result.getText();
        statusEl.textContent = 'Scanned, sending to backend…';
        await sendToBackend(raw);
        stopCamera();
      }
    });

    statusEl.textContent =
      'Point camera at the ' +
      (currentMode === 'wristband' ? 'wristband.' : 'feed label.');

  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Error starting camera: ' + e;
    scanning = false;
  }
}

// ---------------- CAMERA STOP ----------------

function stopCamera() {
  if (codeReader) {
    codeReader.reset();
  }
  scanning = false;
  statusEl.textContent = 'Camera stopped. Choose a scan mode to start again.';
}

// ---------------- SEND TO BACKEND ----------------

async function sendToBackend(raw) {
  try {
    const response = await fetch('http://192.168.0.18:7039/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw })
    });

    const data = await response.json();

    resultCard.style.display = 'block';
    scanTypeEl.textContent = data.scanType || '';

    patientEl.textContent = data.patient
      ? `${data.patient.firstName} ${data.patient.lastName}`
      : '';

    motherEl.textContent = data.mother
      ? `${data.mother.firstName} ${data.mother.lastName}`
      : '';

    feedEl.textContent = data.feed ? data.feed.description : '';

    rawEl.textContent = raw;

  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Error talking to backend: ' + err;
  }
}

// ---------------- SERVICE WORKER ----------------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(console.error);
  });
}
