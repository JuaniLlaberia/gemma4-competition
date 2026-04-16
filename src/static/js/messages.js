// @ts-check
/// <reference path="./types.d.ts" />

import { downloadCSV } from "./csv.js";

/** @type {Map<string, (data: unknown) => HTMLElement>} */
const renderers = new Map();

/**
 * @param {import('./types').MessageType} type
 * @param {(data: unknown) => HTMLElement} fn
 */
export function registerRenderer(type, fn) {
  renderers.set(type, fn);
}

/**
 * @param {import('./types').MessageType} type
 * @param {unknown} data
 * @returns {HTMLElement | null}
 */
export function appendMessage(type, data) {
  const log = document.getElementById("message-log");
  if (!log) return null;
  const renderer = renderers.get(type);
  if (!renderer) return null;
  const el = renderer(data);
  log.appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
  return el;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * @param {string} cls
 * @param {string} html
 * @returns {HTMLElement}
 */
function makeEl(cls, html) {
  const div = document.createElement("div");
  div.className = cls;
  div.innerHTML = html;
  return div;
}

function spinner() {
  return `<svg class="w-3.5 h-3.5 animate-spin text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
  </svg>`;
}

function iconProcessing() {
  return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"/>
  </svg>`;
}

function iconConnection() {
  return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
  </svg>`;
}

function iconClaims() {
  return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
  </svg>`;
}

function iconAnalysis() {
  return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
  </svg>`;
}

/** @param {string} text @returns {string} */
function verdictBadge(text) {
  /** @type {Record<string, string>} */
  const colors = {
    plausible: "bg-green-900/50 text-green-300 border border-green-800/40",
    implausible: "bg-red-900/50 text-red-300 border border-red-800/40",
    uncertain: "bg-[#232323] text-gray-300 border border-[#2e2e2e]",
    support: "bg-green-900/50 text-green-300 border border-green-800/40",
    contradict: "bg-red-900/50 text-red-300 border border-red-800/40",
    no_evidence: "bg-[#232323] text-gray-300 border border-[#2e2e2e]",
  };
  const cls = colors[text] ?? "bg-[#232323] text-gray-300 border border-[#2e2e2e]";
  return `<span class="text-xs px-2 py-0.5 rounded-full font-medium ${cls}">${text.replace(/_/g, " ")}</span>`;
}

// ── Renderers ──────────────────────────────────────────────────────────────────

registerRenderer("user_input", (data) => {
  const d = /** @type {{text?: string; imageFilename?: string}} */ (data);

  if (d.imageFilename) {
    return makeEl(
      "flex items-start gap-4",
      `<div class="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center shrink-0 mt-0.5 text-gray-500">
         <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
         </svg>
       </div>
       <div class="flex-1 min-w-0 pt-1.5">
         <p class="text-[10px] uppercase tracking-widest font-semibold text-gray-600 mb-2">IMAGE INPUT</p>
         <div class="rounded-xl overflow-hidden border border-[#2a2a2a] w-56">
           <div class="h-32 bg-[#111] flex items-center justify-center">
             <svg class="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
             </svg>
           </div>
           <div class="flex items-center gap-2 bg-[#0d1f36] px-3 py-2 border-t border-blue-900/40">
             <svg class="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
             </svg>
             <p class="text-xs text-blue-300 font-medium truncate">${d.imageFilename}</p>
           </div>
         </div>
       </div>`
    );
  }

  return makeEl(
    "flex justify-end",
    `<div class="max-w-prose bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl rounded-tr-sm px-4 py-3">
       <p class="text-sm text-gray-100 whitespace-pre-wrap break-words">${d.text?.slice(0, 300) ?? ""}${(d.text?.length ?? 0) > 300 ? "…" : ""}</p>
     </div>`
  );
});

/**
 * @param {HTMLElement} el
 */
export function finalizeProgressEl(el) {
  const spinnerEl = el.querySelector("svg.animate-spin");
  if (!spinnerEl) return;
  const type = el.dataset.progressType ?? "INFO";
  const wrapper = document.createElement("span");
  wrapper.className = "shrink-0";
  wrapper.innerHTML = type === "SUCCESS"
    ? `<svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
       </svg>`
    : `<svg class="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
       </svg>`;
  spinnerEl.replaceWith(wrapper);
}

registerRenderer("progress", (data) => {
  const d = /** @type {import('./types').SSEProgressEvent} */ (data);
  const el = makeEl(
    "flex items-start gap-4",
    `<div class="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center shrink-0 mt-0.5 text-gray-500">
       ${iconProcessing()}
     </div>
     <div class="flex-1 min-w-0 pt-1.5">
       <p class="text-[10px] uppercase tracking-widest font-semibold text-gray-600 mb-1.5">PROCESSING</p>
       <div class="flex items-center gap-2">
         ${spinner()}
         <span class="text-sm text-white">${d.message}</span>
       </div>
     </div>`
  );
  el.dataset.progressType = d.type ?? "INFO";
  return el;
});

registerRenderer("progress_connection", (data) => {
  const d = /** @type {import('./types').SSEProgressEvent} */ (data);
  const pill = d.connection
    ? `<span class="text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-300 border border-green-800/40 font-medium">Online</span>`
    : `<span class="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-300 border border-red-800/40 font-medium">Offline</span>`;
  const el = makeEl(
    "flex items-start gap-4",
    `<div class="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center shrink-0 mt-0.5 text-gray-500">
       ${iconConnection()}
     </div>
     <div class="flex-1 min-w-0 pt-1.5">
       <p class="text-[10px] uppercase tracking-widest font-semibold text-gray-600 mb-1.5">CONNECTION</p>
       <div class="flex items-center gap-2">
         ${spinner()}
         <span class="text-sm text-white">${d.message}</span>
         ${pill}
       </div>
     </div>`
  );
  el.dataset.progressType = d.type ?? "SUCCESS";
  return el;
});

registerRenderer("progress_claims_count", (data) => {
  const d = /** @type {import('./types').SSEProgressEvent} */ (data);
  const pill = `<span class="text-xs px-2 py-0.5 rounded-full bg-[#232323] text-gray-300 border border-[#2e2e2e] font-medium">${d.claims_amount} claims</span>`;
  const el = makeEl(
    "flex items-start gap-4",
    `<div class="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center shrink-0 mt-0.5 text-gray-500">
       ${iconClaims()}
     </div>
     <div class="flex-1 min-w-0 pt-1.5">
       <p class="text-[10px] uppercase tracking-widest font-semibold text-gray-600 mb-1.5">EXTRACTION</p>
       <div class="flex items-center gap-2">
         ${spinner()}
         <span class="text-sm text-white">${d.message}</span>
         ${pill}
       </div>
     </div>`
  );
  el.dataset.progressType = d.type ?? "SUCCESS";
  return el;
});

registerRenderer("interrupt", (_data) => {
  return makeEl(
    "w-full bg-[#111] border border-[#1e1e1e] rounded-2xl p-5",
    `<div class="claims-editor-mount"></div>`
  );
});

/** @param {import('./types').AnalyzedClaim} c */
function buildClaimResultEl(c) {

  const evidenceItems = c.evidence_used.map((e) =>
    `<li class="text-xs text-gray-500">
       <a href="${e.source_url}" target="_blank" rel="noopener"
          class="text-gray-400 hover:text-white underline underline-offset-2 cursor-pointer">[${(e.relevance * 100).toFixed(0)}%]</a>
       ${e.excerpt}
     </li>`
  ).join("");

  const hasEvidence = c.evidence_used.length > 0;

  const el = makeEl(
    "w-full",
    `<div class="flex items-start gap-3 px-1 py-1.5">
       <div class="w-5 h-5 rounded-full border border-[#3a3a3a] flex items-center justify-center shrink-0 mt-0.5">
         <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
         </svg>
       </div>
       <div class="flex-1 min-w-0">
         <p class="text-sm text-white font-medium leading-snug">${c.text}</p>
         <div class="mt-2 pl-3 border-l-2 border-[#252525] space-y-1.5">
           <div class="flex items-center gap-2 flex-wrap">
             ${verdictBadge(c.veredict)}
             <span class="text-xs text-gray-400">${(c.confidence * 100).toFixed(0)}% confidence</span>
           </div>
           ${c.analysis !== "no_evidence"
             ? `<div class="flex items-center gap-2 flex-wrap">
                  ${verdictBadge(c.analysis)}
                  <span class="text-xs text-gray-500">${(c.analysis_confidence * 100).toFixed(0)}% confidence</span>
                </div>`
             : ""}
           ${c.reasoning
             ? `<p class="text-xs text-gray-400">${c.reasoning}</p>`
             : ""}
         </div>
         ${hasEvidence
           ? `<button class="mt-2 ml-3 text-xs text-gray-600 hover:text-gray-300 transition-colors cursor-pointer flex items-center gap-1" data-expand-toggle>
                <span class="expand-label">Show evidence</span>
                <svg class="w-3 h-3 transition-transform expand-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
              </button>
              <div class="expand-body hidden ml-3 mt-2 pl-3 border-l-2 border-[#252525] space-y-2">
                <ul class="flex flex-col gap-2">${evidenceItems}</ul>
                ${c.limitations ? `<p class="text-xs text-gray-600 italic">${c.limitations}</p>` : ""}
              </div>`
           : ""}
       </div>
     </div>`
  );

  if (hasEvidence) {
    const toggle = el.querySelector("[data-expand-toggle]");
    const body = el.querySelector(".expand-body");
    const icon = el.querySelector(".expand-icon");
    const label = el.querySelector(".expand-label");
    toggle?.addEventListener("click", () => {
      const nowHidden = body?.classList.toggle("hidden");
      icon?.classList.toggle("rotate-180");
      if (label) label.textContent = nowHidden ? "Show evidence" : "Hide evidence";
    });
  }

  return el;
}

registerRenderer("claim_result", (data) => buildClaimResultEl(/** @type {import('./types').AnalyzedClaim} */ (data)));

// ── Claim group (phase 2 grouping) ─────────────────────────────────────────────

/**
 * Creates a claim group container in the message log.
 * All progress steps for a claim are rendered inside it.
 * @param {string} claimText
 * @returns {HTMLElement}
 */
export function createClaimGroupEl(claimText) {
  const log = document.getElementById("message-log");
  const el = document.createElement("div");
  el.className = "w-full flex flex-col";
  el.innerHTML = `
    <div class="flex items-start gap-4">
      <div class="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center shrink-0 mt-0.5 text-gray-500">
        ${iconAnalysis()}
      </div>
      <div class="flex-1 min-w-0 pt-1.5">
        <p class="text-[10px] uppercase tracking-widest font-semibold text-gray-600 mb-1">CLAIM ANALYSIS</p>
        <p class="text-sm text-gray-400 truncate">${claimText}</p>
      </div>
    </div>
    <div class="claim-progress-list pl-[52px] flex flex-col gap-1.5 mt-2"></div>
    <div class="claim-result-mount mt-1"></div>
  `;
  log?.appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
  return el;
}

/**
 * Appends an indented progress item inside a claim group.
 * @param {HTMLElement} groupEl
 * @param {import('./types').SSEProgressEvent} data
 * @returns {HTMLElement | null}
 */
export function appendProgressToGroup(groupEl, data) {
  const progressList = groupEl.querySelector(".claim-progress-list");
  if (!progressList) return null;
  const item = document.createElement("div");
  item.className = "flex items-center gap-2";
  item.dataset.progressType = data.type ?? "INFO";
  item.innerHTML = `${spinner()} <span class="text-sm text-white">${data.message}</span>`;
  progressList.appendChild(item);
  groupEl.scrollIntoView({ behavior: "smooth", block: "end" });
  return item;
}

/**
 * Appends the final claim result inside a claim group's result mount.
 * @param {HTMLElement} groupEl
 * @param {import('./types').AnalyzedClaim} claimData
 */
export function appendClaimResultToGroup(groupEl, claimData) {
  const mount = groupEl.querySelector(".claim-result-mount");
  if (!mount) return;
  const el = buildClaimResultEl(claimData);
  mount.appendChild(el);
  groupEl.scrollIntoView({ behavior: "smooth", block: "end" });
}

registerRenderer("stopped", (data) => {
  const d = /** @type {{claims: import('./types').AnalyzedClaim[]}} */ (data);
  const el = makeEl(
    "w-full bg-[#111] border border-[#2a2218] rounded-xl px-5 py-4 flex items-center justify-between gap-4",
    `<div>
       <p class="text-sm font-medium text-yellow-200/80">Analysis stopped</p>
       <p class="text-xs text-gray-500 mt-0.5">${d.claims.length} claim${d.claims.length !== 1 ? "s" : ""} collected</p>
     </div>
     ${d.claims.length > 0
       ? `<button class="csv-download-btn px-4 py-2 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] text-gray-300 text-xs font-medium hover:bg-[#252525] active:scale-95 transition-all cursor-pointer">Download CSV</button>`
       : ""}`
  );
  if (d.claims.length > 0) {
    el.querySelector(".csv-download-btn")?.addEventListener("click", () => downloadCSV(d.claims));
  }
  return el;
});

registerRenderer("done", (data) => {
  const d = /** @type {{claims: import('./types').AnalyzedClaim[]}} */ (data);
  const el = makeEl(
    "w-full bg-[#111] border border-[#1e2a1e] rounded-xl px-5 py-4 flex items-center justify-between gap-4",
    `<div>
       <p class="text-sm font-medium text-white">Analysis complete</p>
       <p class="text-xs text-gray-500 mt-0.5">${d.claims.length} claim${d.claims.length !== 1 ? "s" : ""} analyzed</p>
     </div>
     <button class="csv-download-btn px-4 py-2 rounded-xl bg-white text-black text-xs font-semibold hover:bg-gray-100 active:scale-95 transition-all cursor-pointer">Download CSV</button>`
  );
  el.querySelector(".csv-download-btn")?.addEventListener("click", () => downloadCSV(d.claims));
  return el;
});

registerRenderer("error", (data) => {
  const d = /** @type {{message: string}} */ (data);
  return makeEl(
    "w-full bg-[#111] border border-[#2a1a1a] rounded-xl px-4 py-3 text-sm text-red-400/80",
    d.message
  );
});
