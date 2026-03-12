// ------------------------------------------------------------
// DISABLE ZXING (prevents conflicts with html5-qrcode)
// ------------------------------------------------------------
window.ZXing = undefined;
window.BrowserBarcodeReader = undefined;
window.BarcodeReader = undefined;

// ------------------------------------------------------------
// ELEMENT REFERENCES
// ------------------------------------------------------------
const cameraCard = document.getElementById('cameraCard');
const cameraTitle = document.getElementById('cameraTitle');
const statusEl = document.getElementById('status');
const videoContainer = document.getElementById('video-container');
const flashOverlay = document.getElementById('flash-overlay');

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

let currentMother = null;
let currentBaby = null;
let currentFeed = null;

// ------------------------------------------------------------
// API CONFIG
// ------------------------------------------------------------
// const API_BASE_URL = "https://localhost:7039";
//const API_BASE_URL = "https://tracefeeder-api-clean-fka7fgcwbxabgrhu.ukwest-01.azurewebsites.net";
const API_BASE_URL = "https://tracefeederapi20260301074957-c9dfh2aqeeded8h9.ukwest-01.azurewebsites.net";


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
// START CAMERA
// ------------------------------------------------------------
async function startCamera() {
  if (scanning) return;
  scanning = true;

  cameraCard.style.display = "block";
  statusEl.textContent = "Scanning…";
  statusEl.classList.add("scanning");

  try {
    scanner = new Html5Qrcode("video-container");

    // Default (PC, Android)
    let constraints = { facingMode: "environment" };

    // iPhone fix: force exact rear camera
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      constraints = { facingMode: { exact: "environment" } };
    }
await scanner.start(
  constraints,
  {
    fps: 10,
    qrbox: { width: 250, height: 250 }
  },
  async (decodedText) => {
    // GREEN FLASH
    flashOverlay.style.opacity = "1";
    setTimeout(() => flashOverlay.style.opacity = "0", 250);

    // Stop scanner safely AFTER decoding is complete
    try {
      await scanner.stop();
    } catch (e) {
      console.warn("Stop warning:", e);
    }

    try {
      scanner.clear();
    } catch (e) {
      console.warn("Clear warning:", e);
    }

    rawEl.textContent = decodedText;
    statusEl.textContent = "Scanned, processing…";
    statusEl.classList.remove("scanning");

    try {
      await handleScan(decodedText);
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Error processing scan: " + err.message;
    }
  }
);
  
// ------------------------------------------------------------
// STOP CAMERA (with fade-out)
// ------------------------------------------------------------
function stopCamera() {
  if (!scanning) return;
  scanning = false;

  statusEl.classList.remove("scanning");
  videoContainer.classList.add("fade-out");

  setTimeout(() => {
    videoContainer.classList.remove("fade-out");
    cameraCard.style.display = "none";
  }, 350);

  if (scanner) {
    scanner.stop().catch(() => {});
    scanner.clear();
  }

  statusEl.textContent = "Camera stopped. Ready when you are.";
}

// ------------------------------------------------------------
// GS1 PARSING
// ------------------------------------------------------------
function parseGs1(raw) {
  const result = {
    gtin: null,
    batch: null,
    expiry: null,
    serial: null,
    colour: null
  };

  const regex = /\((\d{2})\)([^\(]+)/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const ai = match[1];
    const value = match[2].trim();

    switch (ai) {
      case "01": result.gtin = value; break;
      case "10": result.batch = value; break;
      case "17": result.expiry = value; break;
      case "21": result.serial = value; break;
      case "91": result.colour = value.toUpperCase(); break;
    }
  }

  return result;
}

// ------------------------------------------------------------
// CLASSIFICATION HELPERS
// ------------------------------------------------------------
function isWristbandColour(c) { return c === "BLUE" || c === "GREEN"; }
function isFeedColour(c) { return ["YELLOW","RED","PURPLE"].includes(c); }

function classifyWristbandRole(c) {
  if (c === "BLUE") return "Mother";
  if (c === "GREEN") return "Baby";
  return "Unknown";
}

function mapFeedType(c) {
  return {
    YELLOW: "EBM Fresh",
    RED: "EBM Defrosted",
    PURPLE: "Formula"
  }[c] || "Unknown";
}

function mapStorageLocation(c) {
  return {
    YELLOW: "Fridge",
    RED: "Fridge",
    PURPLE: "RoomTemp"
  }[c] || "Unknown";
}

// ------------------------------------------------------------
// MAIN SCAN HANDLER
// ------------------------------------------------------------
async function handleScan(raw) {
  const gs1 = parseGs1(raw);

  if (!gs1.colour) throw new Error("No GS1 AI(91) colour found.");

  if (isWristbandColour(gs1.colour)) {
    await handleWristbandScan(raw, gs1);
  } else if (isFeedColour(gs1.colour)) {
    await handleFeedScan(raw, gs1);
  } else {
    throw new Error(`Unrecognised colour: ${gs1.colour}`);
  }

  updateUi(raw);
}

// ------------------------------------------------------------
// WRISTBAND SCAN HANDLER
// ------------------------------------------------------------
async function handleWristbandScan(raw, gs1) {
  statusEl.textContent = "Scanning wristband…";

  let patient;
  try {
    patient = await apiPost("/api/Patients/wristband-scan", { raw });
  } catch (err) {
    statusEl.textContent = "Wristband scan failed: " + err.message;
    return;
  }

  const role = patient.isMother
    ? "Mother"
    : patient.isBaby
    ? "Baby"
    : "Unknown";

  const summary = {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    fullName: patient.fullName,
    nhsNumber: patient.nhsNumber,
    hospitalNumber: patient.hospitalNumber,
    colour: gs1.colour,
    identifier: raw
  };

  if (role === "Mother") currentMother = summary;
  else if (role === "Baby") currentBaby = summary;

  scanTypeEl.textContent = `${role} wristband`;
  statusEl.textContent = `${role} wristband matched: ${patient.fullName}`;
}

// ------------------------------------------------------------
// FEED SCAN HANDLER
// ------------------------------------------------------------
async function handleFeedScan(raw, gs1) {
  const feedType = mapFeedType(gs1.colour);
  const storageLocation = mapStorageLocation(gs1.colour);

  statusEl.textContent = "Feed label detected, creating feed record…";

  const body = {
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

  if (currentBaby && currentFeed) {
    await assignFeedToBaby(currentFeed, currentBaby);
  } else {
    statusEl.textContent = "Feed created. Scan a baby wristband to assign this feed.";
  }
}

// ------------------------------------------------------------
// FEED ASSIGNMENT
// ------------------------------------------------------------
async function assignFeedToBaby(feed, baby) {
  statusEl.textContent = "Assigning feed to baby…";

  const path = `/api/FeedAssignments?feedId=${encodeURIComponent(feed.id)}&babyId=${encodeURIComponent(baby.id)}`;

  await apiPost(path, {});

  statusEl.textContent = "Feed assigned to baby.";
}

// ------------------------------------------------------------
// UI UPDATE
// ------------------------------------------------------------
function updateUi(raw) {
  resultCard.style.display = "block";

  motherEl.textContent = currentMother ? `${currentMother.firstName} ${currentMother.lastName}` : "";
  patientEl.textContent = currentBaby ? `${currentBaby.firstName} ${currentBaby.lastName}` : "";
  feedEl.textContent = currentFeed ? `${currentFeed.description} (${currentFeed.storageLocation})` : "";

  rawEl.textContent = raw;
}

// ------------------------------------------------------------
// SERVICE WORKER
// ------------------------------------------------------------
//if ("serviceWorker" in navigator) {
//  window.addEventListener("load", () => {
//    navigator.serviceWorker.register("service-worker.js").catch(console.error);
 // });
//}

// ------------------------------------------------------------
// AUTO-START CAMERA WHEN APP LOADS
// ------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  startCamera();
});

// ------------------------------------------------------------
// EXPOSE handleScan GLOBALLY FOR HTML5-QRCODE
// ------------------------------------------------------------
window.handleScan = handleScan;
