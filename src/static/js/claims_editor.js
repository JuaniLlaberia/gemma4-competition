// @ts-check
/// <reference path="./types.d.ts" />

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
    <div class="flex items-center gap-3 mb-5">
      <div class="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center shrink-0 text-gray-500">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/>
        </svg>
      </div>
      <div>
        <p class="text-[10px] uppercase tracking-widest font-semibold text-gray-600">RERANK</p>
        <p class="text-xs text-gray-500 mt-0.5">Reorder or remove claims before analysis</p>
      </div>
    </div>
    <div class="claims-list flex flex-col gap-2 mb-5"></div>
    <div class="flex items-center gap-3">
      <button class="continue-btn cursor-pointer px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
        Continue Analysis
      </button>
      <button class="restart-btn cursor-pointer px-4 py-2 rounded-xl bg-[#1a1a1a] border border-[#252525] text-gray-400 hover:text-gray-200 text-sm font-medium transition-colors">
        Restart
      </button>
      <span class="claims-count text-xs text-gray-600 ml-auto"></span>
    </div>
    <div class="undo-toast hidden fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1e1e1e] border border-[#2a2a2a] text-white text-sm px-4 py-2 rounded-full shadow-xl flex items-center gap-3 z-50">
      <span class="text-gray-300">Claim removed.</span>
      <button class="undo-btn cursor-pointer text-gray-200 hover:text-white font-medium">Undo</button>
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
    if (claims.length > 0) {
      container.style.opacity = "0.4";
      container.style.pointerEvents = "none";
      onContinue(claims);
    }
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

    if (claims.length === 0) {
      listEl.innerHTML = `
        <div class="flex flex-col items-center justify-center py-8 text-center bg-[#151515] border border-[#222] rounded-xl flex-1 mt-2">
          <svg class="w-8 h-8 mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <p class="text-sm font-medium text-gray-300">No claims found.</p>
          <p class="text-xs mt-1.5 max-w-[80%] mx-auto text-gray-500 leading-relaxed">We couldn't extract any verifiable claims from your input. Try providing different text or use the restart button below.</p>
        </div>
      `;
      return;
    }

    claims.forEach((claim, i) => {
      const card = document.createElement("div");
      card.className =
        "flex items-center gap-3 bg-[#151515] border border-[#222] rounded-xl px-4 py-3 cursor-grab active:cursor-grabbing";
      card.draggable = true;
      card.dataset.index = String(i);

      card.innerHTML = `
        <span class="text-gray-600 text-xs w-4 shrink-0 text-right select-none">${i + 1}</span>
        <span class="drag-handle text-gray-700 cursor-grab shrink-0 select-none text-base leading-none">⠿</span>
        <p class="claim-text flex-1 text-sm text-gray-200 min-w-0 outline-none cursor-text" contenteditable="false">${claim.text}</p>
        <div class="flex items-center gap-2 shrink-0">
          <div class="flex flex-col gap-0.5">
            <button class="move-up-btn cursor-pointer text-gray-700 hover:text-gray-300 text-xs leading-none transition-colors" title="Move up">▲</button>
            <button class="move-down-btn cursor-pointer text-gray-700 hover:text-gray-300 text-xs leading-none transition-colors" title="Move down">▼</button>
          </div>
          <button class="delete-btn cursor-pointer text-gray-700 hover:text-red-400 transition-colors text-sm ml-1" title="Delete">✕</button>
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
