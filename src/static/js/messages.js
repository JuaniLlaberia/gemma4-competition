// @ts-check
/// <reference path="./types.d.ts" />

import { downloadCSV } from "./csv.js";

/** @type {Map<string, (data: unknown) => HTMLElement>} */
const renderers = new Map();

/**
 * Register a renderer function for a message type.
 * @param {import('./types').MessageType} type
 * @param {(data: unknown) => HTMLElement} fn
 */
export function registerRenderer(type, fn) {
  renderers.set(type, fn);
}

/**
 * Appends a message to the log and scrolls to bottom.
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
  return `<svg class="w-4 h-4 animate-spin text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
  </svg>`;
}

/** @param {string} text @returns {string} */
function verdictBadge(text) {
  /** @type {Record<string, string>} */
  const colors = {
    plausible: "bg-green-800 text-green-200",
    implausible: "bg-red-800 text-red-200",
    uncertain: "bg-yellow-800 text-yellow-200",
    support: "bg-green-800 text-green-200",
    contradict: "bg-red-800 text-red-200",
    no_evidence: "bg-gray-700 text-gray-300",
  };
  const cls = colors[text] ?? "bg-gray-700 text-gray-300";
  return `<span class="text-xs px-2 py-0.5 rounded-full font-medium ${cls}">${text}</span>`;
}

/** @param {string} text @returns {string} */
function verifiabilityBadge(text) {
  /** @type {Record<string, string>} */
  const colors = {
    likely_verifiable: "bg-blue-800 text-blue-200",
    likely_unverifiable: "bg-orange-800 text-orange-200",
    uncertain: "bg-gray-700 text-gray-300",
  };
  const cls = colors[text] ?? "bg-gray-700 text-gray-300";
  return `<span class="text-xs px-2 py-0.5 rounded-full font-medium ${cls}">${text.replace(/_/g, " ")}</span>`;
}

// ── Renderers ──────────────────────────────────────────────────────────────────

registerRenderer("user_input", (data) => {
  const d = /** @type {{text?: string; imageFilename?: string}} */ (data);
  const content = d.text
    ? `<p class="text-sm text-gray-100 whitespace-pre-wrap break-words">${d.text.slice(0, 300)}${d.text.length > 300 ? "…" : ""}</p>`
    : `<p class="text-sm text-gray-400 italic">🖼 ${d.imageFilename ?? "image"}</p>`;
  return makeEl(
    "flex justify-end",
    `<div class="max-w-prose bg-blue-700 rounded-2xl rounded-tr-sm px-4 py-2">${content}</div>`
  );
});

registerRenderer("progress", (data) => {
  const d = /** @type {import('./types').SSEProgressEvent} */ (data);
  return makeEl(
    "flex items-center gap-2 text-sm text-gray-400",
    `${spinner()}<span>${d.message}</span>`
  );
});

registerRenderer("progress_connection", (data) => {
  const d = /** @type {import('./types').SSEProgressEvent} */ (data);
  const badge = d.connection
    ? `<span class="text-xs px-2 py-0.5 rounded-full bg-green-800 text-green-200 font-medium">Online</span>`
    : `<span class="text-xs px-2 py-0.5 rounded-full bg-red-800 text-red-200 font-medium">Offline</span>`;
  return makeEl(
    "flex items-center gap-2 text-sm text-gray-400",
    `${spinner()}<span>${d.message}</span>${badge}`
  );
});

registerRenderer("progress_claims_count", (data) => {
  const d = /** @type {import('./types').SSEProgressEvent} */ (data);
  const badge = `<span class="text-xs px-2 py-0.5 rounded-full bg-blue-800 text-blue-200 font-medium">${d.claims_amount} claims</span>`;
  return makeEl(
    "flex items-center gap-2 text-sm text-gray-400",
    `${spinner()}<span>${d.message}</span>${badge}`
  );
});

registerRenderer("interrupt", (data) => {
  const el = makeEl(
    "w-full bg-gray-800 border border-gray-700 rounded-xl p-5",
    `<div class="claims-editor-mount"></div>`
  );
  // Claims editor is mounted separately by app.js
  return el;
});

registerRenderer("claim_result", (data) => {
  const c = /** @type {import('./types').AnalyzedClaim} */ (data);
  const evidenceHtml = c.evidence_used.length
    ? `<ul class="mt-1 flex flex-col gap-1">
        ${c.evidence_used.map((e) =>
          `<li class="text-xs text-gray-400">
            <a href="${e.source_url}" target="_blank" rel="noopener" class="text-blue-400 hover:underline">[${(e.relevance * 100).toFixed(0)}%]</a>
            ${e.excerpt}
          </li>`
        ).join("")}
      </ul>`
    : `<p class="text-xs text-gray-500 mt-1">No external evidence.</p>`;

  const el = makeEl(
    "w-full bg-gray-800 border border-gray-700 rounded-xl overflow-hidden",
    `<button class="w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-gray-750 transition-colors" data-expand-toggle>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-gray-100 line-clamp-2">${c.text}</p>
          <div class="flex flex-wrap gap-1.5 mt-1.5">
            ${verdictBadge(c.veredict)}
            <span class="text-xs text-gray-500">confidence ${(c.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
        <svg class="w-4 h-4 shrink-0 text-gray-500 mt-0.5 transition-transform expand-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      <div class="expand-body hidden px-4 pb-4 flex flex-col gap-3 text-sm">
        <p class="text-gray-300"><span class="text-gray-500 font-medium">Reasoning: </span>${c.reasoning}</p>
        <div>
          <p class="text-gray-500 font-medium mb-1">Analysis verdict:</p>
          <div class="flex items-center gap-2">
            ${verdictBadge(c.analysis)}
            <span class="text-gray-500">confidence ${(c.analysis_confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div>
          <p class="text-gray-500 font-medium mb-1">Evidence:</p>
          ${evidenceHtml}
        </div>
        ${c.limitations ? `<p class="text-xs text-gray-500 italic">${c.limitations}</p>` : ""}
      </div>`
  );

  const toggle = el.querySelector("[data-expand-toggle]");
  const body = el.querySelector(".expand-body");
  const icon = el.querySelector(".expand-icon");
  toggle?.addEventListener("click", () => {
    body?.classList.toggle("hidden");
    icon?.classList.toggle("rotate-180");
  });

  return el;
});

registerRenderer("stopped", (data) => {
  const d = /** @type {{claims: import('./types').AnalyzedClaim[]}} */ (data);
  const el = makeEl(
    "w-full bg-gray-800 border border-yellow-800 rounded-xl px-4 py-3 flex items-center justify-between gap-4",
    `<p class="text-sm text-yellow-300">Analysis stopped by user.</p>
     ${d.claims.length > 0
       ? `<button class="csv-download-btn px-3 py-1.5 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-medium transition-colors">Download CSV</button>`
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
    "w-full bg-green-900/40 border border-green-700 rounded-xl px-5 py-4 flex items-center justify-between gap-4",
    `<div>
       <p class="text-base font-semibold text-green-200">Analysis complete.</p>
       <p class="text-sm text-gray-400">${d.claims.length} claim${d.claims.length !== 1 ? "s" : ""} analyzed.</p>
     </div>
     <button class="csv-download-btn px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors">Download CSV</button>`
  );
  el.querySelector(".csv-download-btn")?.addEventListener("click", () => downloadCSV(d.claims));
  return el;
});

registerRenderer("error", (data) => {
  const d = /** @type {{message: string}} */ (data);
  return makeEl(
    "w-full bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300",
    d.message
  );
});
