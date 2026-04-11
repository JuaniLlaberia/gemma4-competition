// @ts-check
/// <reference path="./types.d.ts" />

import { openStream } from "./sse.js";
import { appendMessage, finalizeProgressEl } from "./messages.js";
import { initClaimsEditor } from "./claims_editor.js";
import { downloadCSV } from "./csv.js";

// ── State ─────────────────────────────────────────────────────────────────────

/** @type {import('./types').AppState} */
let appState = "input";

/** @type {string | null} */
let threadId = null;

/** @type {import('./types').AnalyzedClaim[]} */
let accumulatedClaims = [];

/** @type {AbortController | null} */
let streamController = null;

/** @type {HTMLElement | null} */
let lastProgressEl = null;

function finalizeLastProgress() {
  if (lastProgressEl) {
    finalizeProgressEl(lastProgressEl);
    lastProgressEl = null;
  }
}

/** @type {string | null} */
let apiKeySession = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────

const sendBtn = /** @type {HTMLButtonElement} */ (document.getElementById("send-btn"));
const stopBtn = /** @type {HTMLButtonElement} */ (document.getElementById("stop-btn"));
const textInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("text-input"));
const charCounter = /** @type {HTMLElement} */ (document.getElementById("char-counter"));
const textMode = /** @type {HTMLElement} */ (document.getElementById("text-mode"));
const imageMode = /** @type {HTMLElement} */ (document.getElementById("image-mode"));
const imageToggleBtn = /** @type {HTMLButtonElement} */ (document.getElementById("image-toggle-btn"));
const imageDropzone = /** @type {HTMLElement} */ (document.getElementById("image-dropzone"));
const imageFileInput = /** @type {HTMLInputElement} */ (document.getElementById("image-file-input"));
const imagePreviewContainer = /** @type {HTMLElement} */ (document.getElementById("image-preview-container"));
const imagePreview = /** @type {HTMLImageElement} */ (document.getElementById("image-preview"));
const imageFilename = /** @type {HTMLElement} */ (document.getElementById("image-filename"));
const removeImageBtn = /** @type {HTMLButtonElement} */ (document.getElementById("remove-image-btn"));
const ragAttachBtn = /** @type {HTMLButtonElement} */ (document.getElementById("rag-attach-btn"));
const ragFileInput = /** @type {HTMLInputElement} */ (document.getElementById("rag-file-input"));
const ragChips = /** @type {HTMLElement} */ (document.getElementById("rag-chips"));
const inputArea = /** @type {HTMLElement} */ (document.getElementById("input-area"));
const sidebar = /** @type {HTMLElement} */ (document.getElementById("sidebar"));
const sidebarToggle = /** @type {HTMLButtonElement} */ (document.getElementById("sidebar-toggle"));
const sidebarContent = /** @type {HTMLElement} */ (document.getElementById("sidebar-content"));
const sidebarRoleName = /** @type {HTMLElement} */ (document.getElementById("sidebar-role-name"));
const apiKeyForm = /** @type {HTMLElement} */ (document.getElementById("api-key-form"));
const apiKeyDisplay = /** @type {HTMLElement} */ (document.getElementById("api-key-display"));
const apiKeyInput = /** @type {HTMLInputElement} */ (document.getElementById("api-key-input"));
const apiKeyRemember = /** @type {HTMLInputElement} */ (document.getElementById("api-key-remember"));
const apiKeySaveBtn = /** @type {HTMLButtonElement} */ (document.getElementById("api-key-save-btn"));
const apiKeyMasked = /** @type {HTMLElement} */ (document.getElementById("api-key-masked"));
const apiKeyStorageNote = /** @type {HTMLElement} */ (document.getElementById("api-key-storage-note"));
const apiKeyClearBtn = /** @type {HTMLButtonElement} */ (document.getElementById("api-key-clear-btn"));
const exitBtn = /** @type {HTMLButtonElement} */ (document.getElementById("exit-btn"));
const serverStoppedOverlay = /** @type {HTMLElement} */ (document.getElementById("server-stopped-overlay"));

// ── Input mode ────────────────────────────────────────────────────────────────

/** @type {"text" | "image"} */
let inputModeState = "text";
/** @type {File | null} */
let selectedImage = null;
/** @type {File[]} */
let ragFiles = [];

function updateSendBtn() {
  const hasContent =
    (inputModeState === "text" && textInput.value.trim().length > 0) ||
    (inputModeState === "image" && selectedImage !== null);
  sendBtn.disabled = !hasContent || appState !== "input";
}

textInput.addEventListener("input", () => {
  charCounter.textContent = `${textInput.value.length} / 10,000`;
  updateSendBtn();
});

imageToggleBtn.addEventListener("click", () => {
  if (inputModeState === "text") {
    inputModeState = "image";
    textMode.classList.add("hidden");
    imageMode.classList.remove("hidden");
  } else {
    clearImage();
  }
  updateSendBtn();
});

function clearImage() {
  inputModeState = "text";
  selectedImage = null;
  imageMode.classList.add("hidden");
  imagePreviewContainer.classList.add("hidden");
  imageDropzone.classList.remove("hidden");
  textMode.classList.remove("hidden");
}

removeImageBtn.addEventListener("click", clearImage);

imageDropzone.addEventListener("click", () => imageFileInput.click());
imageDropzone.addEventListener("dragover", (e) => e.preventDefault());
imageDropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file) setImage(file);
});
imageFileInput.addEventListener("change", () => {
  const file = imageFileInput.files?.[0];
  if (file) setImage(file);
});

/** @param {File} file */
function setImage(file) {
  selectedImage = file;
  imageFilename.textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.src = /** @type {string} */ (e.target?.result);
  };
  reader.readAsDataURL(file);
  imageDropzone.classList.add("hidden");
  imagePreviewContainer.classList.remove("hidden");
  updateSendBtn();
}

ragAttachBtn.addEventListener("click", () => ragFileInput.click());
ragFileInput.addEventListener("change", () => {
  const files = Array.from(ragFileInput.files ?? []);
  ragFiles.push(...files);
  renderRagChips();
  ragFileInput.value = "";
});

function renderRagChips() {
  ragChips.innerHTML = ragFiles
    .map(
      (f, i) =>
        `<span class="flex items-center gap-1.5 bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded-full">
          ${f.name}
          <button class="text-gray-400 hover:text-red-400 transition-colors" data-rag-idx="${i}">✕</button>
        </span>`
    )
    .join("");
  ragChips.querySelectorAll("[data-rag-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(/** @type {HTMLElement} */ (btn).dataset.ragIdx);
      ragFiles.splice(idx, 1);
      renderRagChips();
    });
  });
}

// ── State transitions ─────────────────────────────────────────────────────────

/** @param {import('./types').AppState} next */
function setState(next) {
  appState = next;
  const streaming = next === "streaming_phase1" || next === "streaming_phase2";
  sendBtn.classList.toggle("hidden", streaming);
  stopBtn.classList.toggle("hidden", !streaming);
  inputArea.classList.toggle("opacity-50", next !== "input");
  inputArea.classList.toggle("pointer-events-none", next !== "input");
  updateSendBtn();
}

// ── Role from URL ─────────────────────────────────────────────────────────────

const params = new URLSearchParams(window.location.search);
const roleName = params.get("role") ?? "";
const roleContent = params.get("content") ?? "";
sidebarRoleName.textContent = roleName || "Unknown";

// ── Send ──────────────────────────────────────────────────────────────────────

sendBtn.addEventListener("click", async () => {
  if (appState !== "input") return;

  const text = inputModeState === "text" ? textInput.value.trim() : "";
  const image = inputModeState === "image" ? selectedImage : null;

  if (!text && !image) return;

  // User input message
  appendMessage("user_input", {
    text: inputModeState === "text" ? text : undefined,
    imageFilename: image?.name,
  });

  textInput.value = "";
  charCounter.textContent = "0 / 10,000";
  accumulatedClaims = [];
  setState("streaming_phase1");

  streamController = new AbortController();

  /** @param {File} file @returns {Promise<string>} */
  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(/** @type {string} */ (e.target?.result ?? ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /** @type {Record<string, unknown>} */
  const body = { role: roleContent };
  if (text) body.text = text;
  if (image) body.image = await readFileAsBase64(image);
  if (ragFiles.length > 0) {
    body.docs = await Promise.all(ragFiles.map(readFileAsBase64));
  }

  try {
    await openStream(
      "/analyze/",
      body,
      (event) => handlePhase1Event(event),
      streamController.signal
    );
  } catch (err) {
    if (/** @type {Error} */ (err).name !== "AbortError") {
      finalizeLastProgress();
      appendMessage("error", { message: String(err) });
      setState("input");
    }
  }
});

/** @param {import('./types').SSEEvent} event */
function handlePhase1Event(event) {
  if ("interrupt" in event) {
    finalizeLastProgress();
    threadId = event.thread_id;
    const interruptEl = appendMessage("interrupt", event);
    if (interruptEl) {
      const mount = interruptEl.querySelector(".claims-editor-mount");
      if (mount instanceof HTMLElement) {
        initClaimsEditor(
          mount,
          event.claims,
          (updatedClaims) => resumeAnalysis(updatedClaims),
          () => resetToInput()
        );
      }
    }
    setState("claims_review");
    return;
  }

  if ("done" in event) return;

  finalizeLastProgress();
  const prog = /** @type {import('./types').SSEProgressEvent} */ (event);
  if (typeof prog.connection === "boolean") {
    lastProgressEl = appendMessage("progress_connection", prog);
  } else if (typeof prog.claims_amount === "number") {
    lastProgressEl = appendMessage("progress_claims_count", prog);
  } else {
    lastProgressEl = appendMessage("progress", prog);
  }
}

// ── Resume ────────────────────────────────────────────────────────────────────

/** @param {import('./types').Claim[]} claims */
async function resumeAnalysis(claims) {
  setState("streaming_phase2");
  streamController = new AbortController();

  try {
    await openStream(
      "/analyze/resume",
      { thread_id: threadId, claims },
      (event) => handlePhase2Event(event),
      streamController.signal
    );
  } catch (err) {
    if (/** @type {Error} */ (err).name !== "AbortError") {
      finalizeLastProgress();
      appendMessage("error", { message: String(err) });
      setState("input");
    }
  }
}

/** @param {import('./types').SSEEvent} event */
function handlePhase2Event(event) {
  if ("done" in event) {
    finalizeLastProgress();
    const finalClaims = event.analyzed_claims ?? accumulatedClaims;
    appendMessage("done", { claims: finalClaims });
    setState("done");
    return;
  }

  if ("claim_result" in event) {
    finalizeLastProgress();
    accumulatedClaims.push(event.claim_result);
    appendMessage("claim_result", event.claim_result);
    return;
  }

  if ("interrupt" in event) return;

  finalizeLastProgress();
  const prog = /** @type {import('./types').SSEProgressEvent} */ (event);
  if (typeof prog.connection === "boolean") {
    lastProgressEl = appendMessage("progress_connection", prog);
  } else {
    lastProgressEl = appendMessage("progress", prog);
  }
}

// ── Stop ──────────────────────────────────────────────────────────────────────

stopBtn.addEventListener("click", () => {
  streamController?.abort();
  finalizeLastProgress();
  if (accumulatedClaims.length > 0) {
    appendMessage("stopped", { claims: [...accumulatedClaims] });
    setState("done");
  } else {
    resetToInput();
  }
});

function resetToInput() {
  const log = document.getElementById("message-log");
  if (log) log.innerHTML = "";
  accumulatedClaims = [];
  threadId = null;
  lastProgressEl = null;
  ragFiles = [];
  renderRagChips();
  clearImage();
  setState("input");
}

// ── Sidebar collapse ──────────────────────────────────────────────────────────

let sidebarCollapsed = false;
sidebarToggle.addEventListener("click", () => {
  sidebarCollapsed = !sidebarCollapsed;
  if (sidebarCollapsed) {
    sidebar.style.width = "3rem";
    sidebarContent.classList.add("hidden");
    sidebarToggle.textContent = "›";
  } else {
    sidebar.style.width = "16rem";
    sidebarContent.classList.remove("hidden");
    sidebarToggle.textContent = "‹";
  }
});

// ── API Key ───────────────────────────────────────────────────────────────────

/** @param {string} key @param {boolean} persisted */
function showKeySet(key, persisted) {
  apiKeySession = key;
  const masked = "••••••••" + key.slice(-4);
  apiKeyMasked.textContent = masked;
  apiKeyStorageNote.textContent = persisted ? "Saved to disk" : "Session only";
  apiKeyForm.classList.add("hidden");
  apiKeyDisplay.classList.remove("hidden");
}

function showKeyUnset() {
  apiKeySession = null;
  apiKeyInput.value = "";
  apiKeyRemember.checked = false;
  apiKeyDisplay.classList.add("hidden");
  apiKeyForm.classList.remove("hidden");
}

apiKeySaveBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  const remember = apiKeyRemember.checked;
  if (remember) {
    await fetch("/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gfca_api_key: key }),
    });
  }
  showKeySet(key, remember);
});

apiKeyClearBtn.addEventListener("click", async () => {
  await fetch("/config/gfca-key", { method: "DELETE" });
  showKeyUnset();
});

// Load persisted key on start
(async () => {
  try {
    const res = await fetch("/config");
    const cfg = await res.json();
    if (cfg.gfca_api_key) {
      showKeySet(cfg.gfca_api_key, true);
    }
  } catch {
    // ignore
  }
})();

// ── Exit ──────────────────────────────────────────────────────────────────────

exitBtn.addEventListener("click", async () => {
  try {
    await fetch("/shutdown", { method: "POST" });
  } catch {
    // expected — server killed itself
  }
  try {
    window.close();
  } catch {
    // blocked by browser
  }
  serverStoppedOverlay.classList.remove("hidden");
});
