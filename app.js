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

// ------------------------------------------------------------
// STATE
// ------------------------------------------------------------
let scanner = null;
let scanning = false;
let currentMode = "wristband"; // "wristband" | "feed"

// Persisted clinical state for this session
let currentMother = null; // { id, firstName, lastName, colour, identifier }
let currentBaby = null;   // { id, firstName, lastName, colour, identifier }
let currentFeed = null;   // { id, description, feedType, storageLocation, colour }

// ------------------------------------------------------------
// API CONFIG
// ------------------------------------------------------------
const API_BASE_URL = "https://tracefeeder-api-clean-fka7fgcwbxabgrhu.ukwest-01.azurewebsites.net";

async function apiPost(path, body) {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API ${path} failed: ${response.status} ${text}`);
  }

  return response.json();
}

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
    scanner = new Html5Qrcode("video-container");

    await scanner.start(
      { facingMode: "environment" },   // rear camera (iOS-safe)
      {
        fps: 10,
        qrbox: { width: 250, height: 250 }
      },
      async (decodedText) => {
        // On successful scan
        stopCamera(); // stop immediately to avoid double scans
        rawEl.textContent = decodedText;
        statusEl.textContent = "Scanned, processing…";

        try {
          await handleScan(decodedText);
        } catch (err) {
          console.error(err);
          statusEl.textContent = "Error processing scan: " + err.message;
        }
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
// GS1 PARSING
// Very simple AI parser for demo purposes
// ------------------------------------------------------------
function parseGs1(raw) {
  // Example: (01)00000000000000(21)M12345(91)BLUE
  const result = {
    gtin: null,
    batch: null,
    expiry: null,
    serial: null,
    colour: null
  };

  // Find all (AI)value segments
  const regex = /\((\d{2})\)([^\(]+)/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const ai = match[1];
    const value = match[2].trim();

    switch (ai) {
      case "01":
        result.gtin = value;
        break;
      case "10":
        result.batch = value;
        break;
      case "17":
        result.expiry = value;
        break;
      case "21":
        result.serial = value;
        break;
      case "91":
        result.colour = value.toUpperCase();
        break;
      default:
        // ignore others for now
        break;
    }
  }

  return result;
}

// ------------------------------------------------------------
// CLASSIFICATION HELPERS
// ------------------------------------------------------------
function isWristbandColour(colour) {
  return colour === "BLUE" || colour === "GREEN";
}

function isFeedColour(colour) {
  return colour === "YELLOW" || colour === "RED" || colour === "PURPLE";
}

function classifyWristbandRole(colour) {
  if (colour === "BLUE") return "Mother";
  if (colour === "GREEN") return "Baby";
  return "Unknown";
}

function mapFeedType(colour) {
  switch (colour) {
    case "YELLOW":
      return "EBM Fresh";
    case "RED":
      return "EBM Defrosted";
    case "PURPLE":
      return "Formula";
    default:
      return "Unknown";
  }
}

function mapStorageLocation(colour) {
  switch (colour) {
    case "YELLOW":
    case "RED":
      return "Fridge";
    case "PURPLE":
      return "RoomTemp";
    default:
      return "Unknown";
  }
}

// ------------------------------------------------------------
// MAIN SCAN HANDLER
// ------------------------------------------------------------
async function handleScan(raw) {
  const gs1 = parseGs1(raw);

  if (!gs1.colour) {
    throw new Error("No GS1 AI(91) colour found in code.");
  }

  // Decide what this scan represents
  if (isWristbandColour(gs1.colour)) {
    await handleWristbandScan(raw, gs1);
  } else if (isFeedColour(gs1.colour)) {
    await handleFeedScan(raw, gs1);
  } else {
    throw new Error(`Unrecognised colour code: ${gs1.colour}`);
  }

  updateUi(raw);
}

// ------------------------------------------------------------
// WRISTBAND SCAN HANDLER
// ------------------------------------------------------------
async function handleWristbandScan(raw, gs1) {
  const role = classifyWristbandRole(gs1.colour); // "Mother" or "Baby"

  if (role === "Unknown") {
    throw new Error(`Cannot classify wristband role from colour: ${gs1.colour}`);
  }

  statusEl.textContent = `Detected ${role} wristband, creating/updating patient…`;

  const body = {
    // These fields depend on your backend model; adjust names if needed
    firstName: role === "Mother" ? "Demo Mother" : "Demo Baby",
    lastName: gs1.serial || "TraceFeeder",
    role: role,
    colour: gs1.colour,
    identifier: gs1.serial || raw
  };

  const patient = await apiPost("/api/Patients", body);

  const patientSummary = {
    id: patient.id,
    firstName: patient.firstName || body.firstName,
    lastName: patient.lastName || body.lastName,
    colour: gs1.colour,
    identifier: gs1.serial || raw
  };

  if (role === "Mother") {
    currentMother = patientSummary;
    statusEl.textContent = "Mother wristband scanned and stored.";
  } else {
    currentBaby = patientSummary;
    statusEl.textContent = "Baby wristband scanned and stored.";
  }

  scanTypeEl.textContent = `${role} wristband`;
}

// ------------------------------------------------------------
// FEED SCAN HANDLER
// ------------------------------------------------------------
async function handleFeedScan(raw, gs1) {
  const feedType = mapFeedType(gs1.colour);
  const storageLocation = mapStorageLocation(gs1.colour);

  statusEl.textContent = "Feed label detected, creating feed record…";

  const body = {
    // Adjust field names to match your backend model
    description: feedType,
    feedType: feedType,
    storageLocation: storageLocation,
    colour: gs1.colour,
    gtin: gs1.gtin,
    batch: gs1.batch,
    expiry: gs1.expiry,
    serial: gs1.serial || raw
  };

  const feed = await apiPost("/api/Feeds", body);

  currentFeed = {
    id: feed.id,
    description: feed.description || feedType,
    feedType: feed.feedType || feedType,
    storageLocation: feed.storageLocation || storageLocation,
    colour: gs1.colour
  };

  scanTypeEl.textContent = "Feed label";

  // If we already have a baby, auto-assign
  if (currentBaby && currentFeed) {
    await assignFeedToBaby(currentFeed, currentBaby);
  } else {
    statusEl.textContent =
      "Feed created. Scan a baby wristband to assign this feed.";
  }
}

// ------------------------------------------------------------
// FEED ASSIGNMENT
// ------------------------------------------------------------
async function assignFeedToBaby(feed, baby) {
  statusEl.textContent = "Assigning feed to baby…";

  const path = `/api/FeedAssignments?feedId=${encodeURIComponent(
    feed.id
  )}&babyId=${encodeURIComponent(baby.id)}`;

  // Body can be empty if your API only uses query params
  await apiPost(path, {});

  statusEl.textContent = "Feed assigned to baby.";
}

// ------------------------------------------------------------
// UI UPDATE
// ------------------------------------------------------------
function updateUi(raw) {
  resultCard.style.display = "block";

  // Current mother/baby always visible
  if (currentMother) {
    motherEl.textContent = `${currentMother.firstName} ${currentMother.lastName}`;
  } else {
    motherEl.textContent = "";
  }

  if (currentBaby) {
    patientEl.textContent = `${currentBaby.firstName} ${currentBaby.lastName}`;
  } else {
    patientEl.textContent = "";
  }

  if (currentFeed) {
    feedEl.textContent = `${currentFeed.description} (${currentFeed.storageLocation})`;
  } else {
    feedEl.textContent = "";
  }

  rawEl.textContent = raw;
}

// ------------------------------------------------------------
// SERVICE WORKER
// ------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(console.error);
  });
}