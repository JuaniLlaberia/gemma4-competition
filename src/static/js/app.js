// @ts-check
/// <reference path="./types.d.ts" />

import { openStream } from "./sse.js";
import {
  appendMessage,
  finalizeProgressEl,
  createClaimGroupEl,
  appendProgressToGroup,
  appendClaimResultToGroup,
} from "./messages.js";
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

// ── Role state ────────────────────────────────────────────────────────────────

const urlParams = new URLSearchParams(window.location.search);
let roleName = urlParams.get("role") ?? "";
let roleContent = urlParams.get("content") ?? "";

// If role name provided via URL but no content, fetch it async
if (roleName && !roleContent) {
  fetch(`/roles/${encodeURIComponent(roleName)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => { if (data) roleContent = data.content; })
    .catch(() => {});
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const sendBtn        = /** @type {HTMLButtonElement} */ (document.getElementById("send-btn"));
const stopBtn        = /** @type {HTMLButtonElement} */ (document.getElementById("stop-btn"));
const resetBtn       = /** @type {HTMLButtonElement} */ (document.getElementById("reset-btn"));
const textInput      = /** @type {HTMLTextAreaElement} */ (document.getElementById("text-input"));
const charCounter    = /** @type {HTMLElement} */ (document.getElementById("char-counter"));
const textMode       = /** @type {HTMLElement} */ (document.getElementById("text-mode"));
const imageMode      = /** @type {HTMLElement} */ (document.getElementById("image-mode"));
const imageToggleBtn = /** @type {HTMLButtonElement} */ (document.getElementById("image-toggle-btn"));
const imageDropzone  = /** @type {HTMLElement} */ (document.getElementById("image-dropzone"));
const imageFileInput = /** @type {HTMLInputElement} */ (document.getElementById("image-file-input"));
const imagePreviewContainer = /** @type {HTMLElement} */ (document.getElementById("image-preview-container"));
const imagePreview   = /** @type {HTMLImageElement} */ (document.getElementById("image-preview"));
const imageFilename  = /** @type {HTMLElement} */ (document.getElementById("image-filename"));
const removeImageBtn = /** @type {HTMLButtonElement} */ (document.getElementById("remove-image-btn"));
const ragAttachBtn   = /** @type {HTMLButtonElement} */ (document.getElementById("rag-attach-btn"));
const ragFileInput   = /** @type {HTMLInputElement} */ (document.getElementById("rag-file-input"));
const ragChips       = /** @type {HTMLElement} */ (document.getElementById("rag-chips"));
const roleNameDisplay = /** @type {HTMLElement} */ (document.getElementById("role-name-display"));

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

textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled && appState === "input") {
      sendBtn.click();
    }
  }
});

imageToggleBtn.addEventListener("click", () => {
  if (appState !== "input") return;
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
    imagePreview.src = /** @type {string} */ (e.target?.result ?? "");
  };
  reader.readAsDataURL(file);
  imageDropzone.classList.add("hidden");
  imagePreviewContainer.classList.remove("hidden");
  updateSendBtn();
}

ragAttachBtn.addEventListener("click", () => {
  if (appState !== "input") return;
  ragFileInput.click();
});
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
        `<span class="flex items-center gap-1.5 bg-[#1e1e1e] border border-[#2a2a2a] text-gray-300 text-xs px-2.5 py-1.5 rounded-lg">
          <svg class="w-3 h-3 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          ${f.name}
          <button class="rag-remove-btn ${appState !== 'input' ? 'hidden' : ''} text-gray-600 hover:text-red-400 transition-colors cursor-pointer ml-0.5" data-rag-idx="${i}">✕</button>
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
  const done = next === "done";
  // Input is blocked for any state after the first send
  const blocked = streaming || next === "claims_review" || done;

  sendBtn.classList.toggle("hidden", blocked);
  stopBtn.classList.toggle("hidden", !streaming);
  resetBtn.classList.toggle("hidden", !done);

  textInput.disabled = blocked;
  imageToggleBtn.disabled = blocked;
  ragAttachBtn.disabled = blocked;
  if (apiKeyBtn) /** @type {HTMLButtonElement} */ (apiKeyBtn).disabled = blocked;
  if (roleBtn) /** @type {HTMLButtonElement} */ (roleBtn).disabled = blocked;
  textInput.classList.toggle("opacity-40", blocked);

  removeImageBtn.classList.toggle("hidden", blocked);
  document.querySelectorAll(".rag-remove-btn").forEach((btn) => {
    btn.classList.toggle("hidden", blocked);
  });

  updateSendBtn();
}

// ── Welcome → Chat transition ─────────────────────────────────────────────────

let chatMode = false;

function switchToChat() {
  if (chatMode) return;
  chatMode = true;
  document.getElementById("top-spacer")?.classList.add("hidden");
  document.getElementById("bottom-spacer")?.classList.add("hidden");
  document.getElementById("welcome-text")?.classList.add("hidden");
  document.getElementById("chat-screen")?.classList.remove("hidden");
}

// ── Role display ──────────────────────────────────────────────────────────────

function updateRoleDisplay() {
  if (roleNameDisplay) {
    if (roleName) {
      roleNameDisplay.textContent = roleName;
      roleNameDisplay.classList.remove("hidden");
    } else {
      roleNameDisplay.textContent = "";
      roleNameDisplay.classList.add("hidden");
    }
  }
}

// Init display from URL params
updateRoleDisplay();

// ── Send ──────────────────────────────────────────────────────────────────────

sendBtn.addEventListener("click", async () => {
  if (appState !== "input") return;

  const text = inputModeState === "text" ? textInput.value.trim() : "";
  const image = inputModeState === "image" ? selectedImage : null;

  if (!text && !image) return;

  appendMessage("user_input", {
    text: inputModeState === "text" ? text : undefined,
    imageFilename: image?.name,
  });
  switchToChat();

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

// ── Phase 1 handler ───────────────────────────────────────────────────────────

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

// ── Phase 2 (resume) ──────────────────────────────────────────────────────────

/** @type {import('./types').Claim[]} */
let phaseClaimQueue = [];
let phaseClaimIdx = 0;
/** @type {HTMLElement | null} */
let currentClaimGroupEl = null;
/** @type {HTMLElement | null} */
let lastGroupProgressEl = null;
/** tracks whether the connection result event has been received */
let connectionChecked = false;

function finalizeLastGroupProgress() {
  if (lastGroupProgressEl) {
    finalizeProgressEl(lastGroupProgressEl);
    lastGroupProgressEl = null;
  }
}

/** @param {import('./types').Claim[]} claims */
async function resumeAnalysis(claims) {
  phaseClaimQueue = [...claims];
  phaseClaimIdx = 0;
  currentClaimGroupEl = null;
  lastGroupProgressEl = null;
  connectionChecked = false;

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
      finalizeLastGroupProgress();
      finalizeLastProgress();
      appendMessage("error", { message: String(err) });
      setState("input");
    }
  }
}

/** @param {import('./types').SSEEvent} event */
function handlePhase2Event(event) {
  if ("done" in event) {
    finalizeLastGroupProgress();
    finalizeLastProgress();
    const finalClaims = event.analyzed_claims ?? accumulatedClaims;
    appendMessage("done", { claims: finalClaims });
    setState("done");
    return;
  }

  if ("claim_result" in event) {
    finalizeLastGroupProgress();
    accumulatedClaims.push(event.claim_result);
    if (currentClaimGroupEl) {
      appendClaimResultToGroup(currentClaimGroupEl, event.claim_result);
    } else {
      appendMessage("claim_result", event.claim_result);
    }
    currentClaimGroupEl = null;
    phaseClaimIdx++;
    return;
  }

  if ("interrupt" in event) return;

  const prog = /** @type {import('./types').SSEProgressEvent} */ (event);

  // Connection result (the event that carries connection: boolean) — top level
  if (typeof prog.connection === "boolean") {
    connectionChecked = true;
    finalizeLastProgress(); // finalize "Validating..." spinner
    lastProgressEl = appendMessage("progress_connection", prog);
    return;
  }

  // Pre-connection progress (e.g. "Validating your internet connection...") — top level
  if (!connectionChecked) {
    finalizeLastProgress();
    lastProgressEl = appendMessage("progress", prog);
    return;
  }

  // Claim analysis progress — create group on first event per claim
  if (!currentClaimGroupEl) {
    finalizeLastProgress(); // finalize connection result spinner
    const claimText = phaseClaimQueue[phaseClaimIdx]?.text ?? "";
    currentClaimGroupEl = createClaimGroupEl(claimText);
  }

  finalizeLastGroupProgress();
  lastGroupProgressEl = appendProgressToGroup(currentClaimGroupEl, prog);
}

// ── Stop ──────────────────────────────────────────────────────────────────────

stopBtn.addEventListener("click", () => {
  streamController?.abort();
  finalizeLastGroupProgress();
  finalizeLastProgress();
  if (accumulatedClaims.length > 0) {
    appendMessage("stopped", { claims: [...accumulatedClaims] });
    setState("done");
  } else {
    resetToInput();
  }
});

function resetToInput() {
  chatMode = false;
  document.getElementById("top-spacer")?.classList.remove("hidden");
  document.getElementById("bottom-spacer")?.classList.remove("hidden");
  document.getElementById("welcome-text")?.classList.remove("hidden");
  document.getElementById("chat-screen")?.classList.add("hidden");

  const log = document.getElementById("message-log");
  if (log) log.innerHTML = "";
  accumulatedClaims = [];
  threadId = null;
  lastProgressEl = null;
  currentClaimGroupEl = null;
  lastGroupProgressEl = null;
  phaseClaimQueue = [];
  phaseClaimIdx = 0;
  ragFiles = [];
  renderRagChips();
  clearImage();
  setState("input");
}

resetBtn.addEventListener("click", () => resetToInput());

// ── API Key Modal ─────────────────────────────────────────────────────────────

const apiKeyBtn         = document.getElementById("api-key-btn");
const apiKeyModal       = document.getElementById("api-key-modal");
const apiKeyModalClose  = document.getElementById("api-key-modal-close");
const modalApiKeyForm   = document.getElementById("modal-api-key-form");
const modalApiKeyDisplay = document.getElementById("modal-api-key-display");
const modalApiKeyInput  = /** @type {HTMLInputElement} */ (document.getElementById("modal-api-key-input"));
const modalApiKeySave   = document.getElementById("modal-api-key-save");
const modalApiKeyMasked = document.getElementById("modal-api-key-masked");
const modalApiKeyClear  = document.getElementById("modal-api-key-clear");

function syncApiKeyModal() {
  if (apiKeySession) {
    modalApiKeyForm?.classList.add("hidden");
    modalApiKeyDisplay?.classList.remove("hidden");
    if (modalApiKeyMasked) modalApiKeyMasked.textContent = "••••••••" + apiKeySession.slice(-4);
  } else {
    modalApiKeyForm?.classList.remove("hidden");
    modalApiKeyDisplay?.classList.add("hidden");
    if (modalApiKeyInput) modalApiKeyInput.value = "";
  }
}

apiKeyBtn?.addEventListener("click", () => {
  if (appState !== "input") return;
  syncApiKeyModal();
  apiKeyModal?.classList.remove("hidden");
});
apiKeyModalClose?.addEventListener("click", () => apiKeyModal?.classList.add("hidden"));
apiKeyModal?.addEventListener("click", (e) => {
  if (e.target === apiKeyModal) apiKeyModal.classList.add("hidden");
});

modalApiKeySave?.addEventListener("click", async () => {
  const key = modalApiKeyInput?.value.trim();
  if (!key) return;
  await fetch("/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gfca_api_key: key }),
  });
  apiKeySession = key;
  syncApiKeyModal();
});

modalApiKeyClear?.addEventListener("click", async () => {
  await fetch("/config/gfca-key", { method: "DELETE" });
  apiKeySession = null;
  syncApiKeyModal();
  apiKeyModal?.classList.add("hidden");
});

// Load persisted key on start
(async () => {
  try {
    const res = await fetch("/config");
    const cfg = await res.json();
    if (cfg.gfca_api_key) {
      apiKeySession = cfg.gfca_api_key;
    }
  } catch { /* ignore */ }
})();

// ── Role Modal ────────────────────────────────────────────────────────────────

const roleBtn              = document.getElementById("role-btn");
const roleModal            = document.getElementById("role-modal");
const roleModalClose       = document.getElementById("role-modal-close");
const modalRoleGrid        = document.getElementById("modal-role-grid");
const modalRoleEmpty       = document.getElementById("modal-role-empty");
const modalRoleShowCreate  = document.getElementById("modal-role-show-create");
const modalRoleCreateForm  = document.getElementById("modal-role-create-form");
const modalNewRoleName     = /** @type {HTMLInputElement} */ (document.getElementById("modal-new-role-name"));
const modalNewRoleContent  = /** @type {HTMLTextAreaElement} */ (document.getElementById("modal-new-role-content"));
const modalNewRoleSave     = document.getElementById("modal-new-role-save");
const modalNewRoleCancel   = document.getElementById("modal-new-role-cancel");
const modalNewRoleError    = document.getElementById("modal-new-role-error");

/** @typedef {{ name: string, preview: string }} RoleListItem */

async function loadAndRenderRoleModal() {
  if (!modalRoleGrid) return;
  try {
    const res = await fetch("/roles");
    const roles = /** @type {RoleListItem[]} */ (await res.json());
    renderRoleModal(roles);
  } catch {
    // ignore network errors
  }
}

/** @param {RoleListItem[]} roles */
function renderRoleModal(roles) {
  if (!modalRoleGrid) return;
  modalRoleGrid.innerHTML = "";

  if (roles.length === 0) {
    modalRoleEmpty?.classList.remove("hidden");
  } else {
    modalRoleEmpty?.classList.add("hidden");
  }

  // "No role" option
  const noRoleActive = !roleName;
  const noRoleEl = document.createElement("div");
  noRoleEl.className = `flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all active:scale-[0.98] ${
    noRoleActive
      ? "bg-[#1a1a1a] border border-[#2a2a2a]"
      : "bg-[#0d0d0d] border border-[#1e1e1e] hover:border-[#2a2a2a]"
  }`;
  noRoleEl.innerHTML = `
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium ${noRoleActive ? "text-white" : "text-gray-400"}">No role</p>
      <p class="text-xs text-gray-600 mt-0.5">Analyze without a specific role</p>
    </div>
    ${noRoleActive
      ? `<svg class="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
         </svg>`
      : ""}
  `;
  noRoleEl.addEventListener("click", () => {
    roleName = "";
    roleContent = "";
    updateRoleDisplay();
    roleModal?.classList.add("hidden");
  });
  modalRoleGrid.appendChild(noRoleEl);

  roles.forEach((role) => {
    const isActive = role.name === roleName;
    const el = document.createElement("div");
    el.className = `flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all active:scale-[0.98] ${
      isActive
        ? "bg-[#1a1a1a] border border-[#2a2a2a]"
        : "bg-[#0d0d0d] border border-[#1e1e1e] hover:border-[#2a2a2a]"
    }`;
    el.innerHTML = `
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium ${isActive ? "text-white" : "text-gray-300"} truncate">${role.name}</p>
        <p class="text-xs text-gray-600 truncate mt-0.5">${role.preview}</p>
      </div>
      ${isActive
        ? `<svg class="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
           </svg>`
        : ""}
    `;
    el.addEventListener("click", async () => {
      try {
        const r = await fetch(`/roles/${encodeURIComponent(role.name)}`);
        if (r.ok) {
          const data = await r.json();
          roleName = data.name;
          roleContent = data.content;
        } else {
          roleName = role.name;
          roleContent = "";
        }
      } catch {
        roleName = role.name;
        roleContent = "";
      }
      updateRoleDisplay();
      roleModal?.classList.add("hidden");
    });
    modalRoleGrid.appendChild(el);
  });
}

roleBtn?.addEventListener("click", () => {
  if (appState !== "input") return;
  if (modalRoleCreateForm) modalRoleCreateForm.classList.add("hidden");
  if (modalRoleShowCreate) modalRoleShowCreate.classList.remove("hidden");
  if (modalNewRoleError) modalNewRoleError.classList.add("hidden");
  loadAndRenderRoleModal();
  roleModal?.classList.remove("hidden");
});

roleModalClose?.addEventListener("click", () => roleModal?.classList.add("hidden"));
roleModal?.addEventListener("click", (e) => {
  if (e.target === roleModal) roleModal.classList.add("hidden");
});

modalRoleShowCreate?.addEventListener("click", () => {
  modalRoleCreateForm?.classList.remove("hidden");
  modalRoleShowCreate.classList.add("hidden");
  modalNewRoleName?.focus();
});

modalNewRoleCancel?.addEventListener("click", () => {
  modalRoleCreateForm?.classList.add("hidden");
  modalRoleShowCreate?.classList.remove("hidden");
  if (modalNewRoleName) modalNewRoleName.value = "";
  if (modalNewRoleContent) modalNewRoleContent.value = "";
  modalNewRoleError?.classList.add("hidden");
});

modalNewRoleSave?.addEventListener("click", async () => {
  const name = modalNewRoleName?.value.trim() ?? "";
  const content = modalNewRoleContent?.value.trim() ?? "";
  modalNewRoleError?.classList.add("hidden");

  if (!name) {
    if (modalNewRoleError) {
      modalNewRoleError.textContent = "Role name cannot be empty.";
      modalNewRoleError.classList.remove("hidden");
    }
    return;
  }

  const res = await fetch("/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (modalNewRoleError) {
      modalNewRoleError.textContent = (/** @type {any} */ (body)).detail ?? "Error saving role.";
      modalNewRoleError.classList.remove("hidden");
    }
    return;
  }

  roleName = name;
  roleContent = content;
  updateRoleDisplay();
  roleModal?.classList.add("hidden");
});
