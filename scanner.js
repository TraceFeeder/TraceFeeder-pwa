// scanner.js
// ------------------------------------------------------------
// Basic config
// ------------------------------------------------------------
const API_BASE_URL = window.API_BASE_URL || "http://localhost:5000";

// ------------------------------------------------------------
// Simple API helpers
// (If you already define these in app.js, you can remove them here)
// ------------------------------------------------------------
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
// Shared state + UI elements
// (If these are already defined in app.js, remove the duplicates)
// ------------------------------------------------------------
let currentMother = window.currentMother || null;
let currentBaby = window.currentBaby || null;

const statusEl = document.getElementById("status");
const scanTypeEl = document.getElementById("scanType");

// ------------------------------------------------------------
// Type detection helpers
// ------------------------------------------------------------
function isWristbandRaw(raw) {
  // GS1-style NHS number (8018), or legacy 10-digit NHS, or HOSP- prefix
  if (raw.startsWith("(8018")) return true;
  if (/^\d{10}$/.test(raw)) return true;
  if (raw.toUpperCase().startsWith("HOSP-")) return true;
  return false;
}

function isFeedRaw(raw) {
  // Your feed labels from QrPayloadBuilder: TF|FEED|...
  return raw.startsWith("TF|FEED|");
}

// ------------------------------------------------------------
// MAIN SCAN ROUTER
// Call this from your camera/decoder: handleScan(raw)
// ------------------------------------------------------------
async function handleScan(raw) {
  if (!raw || typeof raw !== "string") {
    if (statusEl) statusEl.textContent = "No barcode content detected";
    return;
  }

  try {
    // 1. Wristbands (GS1 + legacy)
    if (isWristbandRaw(raw)) {
      await handleWristbandScan(raw);
      return;
    }

    // 2. Feeds
    if (isFeedRaw(raw)) {
      await handleFeedScan(raw);
      return;
    }

    // 3. Unknown
    if (scanTypeEl) scanTypeEl.textContent = "Unknown";
    if (statusEl) statusEl.textContent = `Unknown barcode type: ${raw}`;
  } catch (err) {
    if (statusEl) statusEl.textContent = `Scan error: ${err.message}`;
  }
}

// ------------------------------------------------------------
// WRISTBAND SCAN HANDLER
// Sends raw to backend → GS1/legacy parsing → patient lookup
// ------------------------------------------------------------
async function handleWristbandScan(raw) {
  if (scanTypeEl) scanTypeEl.textContent = "Wristband";
  if (statusEl) statusEl.textContent = "Scanning wristband…";

  const body = { raw };

  let patient;
  try {
    patient = await apiPost("/api/Patients/wristband-scan", body);
  } catch (err) {
    if (statusEl) statusEl.textContent = `Wristband scan failed: ${err.message}`;
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
    hospitalNumber: patient.hospitalNumber
  };

  if (role === "Mother") {
    currentMother = summary;
    window.currentMother = summary;
  } else if (role === "Baby") {
    currentBaby = summary;
    window.currentBaby = summary;
  }

  if (scanTypeEl) scanTypeEl.textContent = `${role} wristband`;
  if (statusEl) statusEl.textContent = `${role} wristband matched: ${patient.fullName}`;
}

// ------------------------------------------------------------
// FEED SCAN HANDLER (stub – you can expand later)
// ------------------------------------------------------------
async function handleFeedScan(raw) {
  if (scanTypeEl) scanTypeEl.textContent = "Feed label";
  if (statusEl) statusEl.textContent = `Feed label scanned: ${raw}`;

  // Later: parse TF|FEED|... and call your feed endpoints
}

// ------------------------------------------------------------
// Expose handleScan globally so your scanner can call it
// ------------------------------------------------------------
window.handleScan = handleScan;