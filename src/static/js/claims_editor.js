// @ts-check
/// <reference path="./types.d.ts" />

/**
 * @param {number} score
 * @returns {string}
 */
function scoreColor(score) {
  if (score >= 0.7) return "bg-green-700 text-green-100";
  if (score >= 0.4) return "bg-yellow-700 text-yellow-100";
  return "bg-red-800 text-red-100";
}

/**
 * Initializes the claims editor inside `container`.
 * @param {HTMLElement} container
 * @param {import('./types').Claim[]} initialClaims
 * @param {(claims: import('./types').Claim[]) => void} onContinue
 * @param {() => void} onRestart
 */
export function initClaimsEditor(container, initialClaims, onContinue, onRestart) {
  /** @type {import('./types').Claim[]} */
  let claims = [...initialClaims];

  /** @type {{claim: import('./types').Claim, index: number} | null} */
  let undoPending = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let undoTimer = null;

  const html = `
    <h3 class="text-base font-semibold text-white mb-1">Review Extracted Claims</h3>
    <p class="text-sm text-gray-400 mb-4">Reorder, edit, or remove claims before continuing analysis.</p>
    <div class="claims-list flex flex-col gap-2 mb-4"></div>
    <div class="flex items-center gap-3 mt-4">
      <button class="continue-btn px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        Continue Analysis
      </button>
      <button class="restart-btn px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors">
        Restart
      </button>
      <span class="claims-count text-xs text-gray-500 ml-auto"></span>
    </div>
    <div class="undo-toast hidden fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-700 text-white text-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-3 z-50">
      <span>Claim removed.</span>
      <button class="undo-btn text-blue-300 hover:text-blue-200 font-medium">Undo</button>
    </div>
  `;
  container.innerHTML = html;

  const listEl = /** @type {HTMLElement} */ (container.querySelector(".claims-list"));
  const continueBtn = /** @type {HTMLButtonElement} */ (container.querySelector(".continue-btn"));
  const restartBtn = /** @type {HTMLButtonElement} */ (container.querySelector(".restart-btn"));
  const countEl = /** @type {HTMLElement} */ (container.querySelector(".claims-count"));
  const toast = /** @type {HTMLElement} */ (container.querySelector(".undo-toast"));
  const undoBtn = /** @type {HTMLElement} */ (container.querySelector(".undo-btn"));

  restartBtn.addEventListener("click", onRestart);
  continueBtn.addEventListener("click", () => {
    if (claims.length > 0) onContinue(claims);
  });
  undoBtn.addEventListener("click", () => {
    if (undoPending) {
      claims.splice(undoPending.index, 0, undoPending.claim);
      undoPending = null;
      if (undoTimer) clearTimeout(undoTimer);
      toast.classList.add("hidden");
      render();
    }
  });

  /** @param {number} dragIndex */
  let dragIndex = -1;

  function render() {
    listEl.innerHTML = "";
    continueBtn.disabled = claims.length === 0;
    countEl.textContent = `${claims.length} claim${claims.length !== 1 ? "s" : ""}`;

    claims.forEach((claim, i) => {
      const card = document.createElement("div");
      card.className =
        "flex items-start gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing";
      card.draggable = true;
      card.dataset.index = String(i);

      const score = claim.relevance_score ?? 0;
      const scoreCls = scoreColor(score);

      card.innerHTML = `
        <div class="drag-handle mt-1 text-gray-500 cursor-grab shrink-0">⠿</div>
        <div class="flex-1 min-w-0">
          <p class="claim-text text-sm text-gray-100 cursor-text" contenteditable="false">${claim.text}</p>
        </div>
        <div class="flex items-center gap-1.5 shrink-0 mt-0.5">
          <span class="text-xs font-mono px-1.5 py-0.5 rounded ${scoreCls}">${score.toFixed(2)}</span>
          <div class="flex flex-col gap-0.5">
            <button class="move-up-btn text-gray-500 hover:text-white text-xs leading-none" title="Move up">▲</button>
            <button class="move-down-btn text-gray-500 hover:text-white text-xs leading-none" title="Move down">▼</button>
          </div>
          <button class="delete-btn text-gray-600 hover:text-red-400 transition-colors text-sm" title="Delete">✕</button>
        </div>
      `;

      // Inline edit
      const textEl = /** @type {HTMLElement} */ (card.querySelector(".claim-text"));
      textEl.addEventListener("click", () => {
        textEl.contentEditable = "true";
        textEl.focus();
      });
      textEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          textEl.blur();
        }
      });
      textEl.addEventListener("blur", () => {
        textEl.contentEditable = "false";
        claims[i] = { ...claims[i], text: textEl.textContent?.trim() ?? claims[i].text };
      });

      // Move up/down
      card.querySelector(".move-up-btn")?.addEventListener("click", () => {
        if (i > 0) { [claims[i - 1], claims[i]] = [claims[i], claims[i - 1]]; render(); }
      });
      card.querySelector(".move-down-btn")?.addEventListener("click", () => {
        if (i < claims.length - 1) { [claims[i], claims[i + 1]] = [claims[i + 1], claims[i]]; render(); }
      });

      // Delete with undo
      card.querySelector(".delete-btn")?.addEventListener("click", () => {
        if (undoTimer) clearTimeout(undoTimer);
        undoPending = { claim: claims[i], index: i };
        claims.splice(i, 1);
        render();
        toast.classList.remove("hidden");
        undoTimer = setTimeout(() => {
          toast.classList.add("hidden");
          undoPending = null;
        }, 5000);
      });

      // Drag-and-drop
      card.addEventListener("dragstart", () => { dragIndex = i; });
      card.addEventListener("dragover", (e) => { e.preventDefault(); });
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        if (dragIndex === i || dragIndex < 0) return;
        const moved = claims.splice(dragIndex, 1)[0];
        claims.splice(i, 0, moved);
        dragIndex = -1;
        render();
      });

      listEl.appendChild(card);
    });
  }

  render();
}
