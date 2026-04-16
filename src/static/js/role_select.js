// @ts-check

const roleGrid = /** @type {HTMLElement} */ (document.getElementById("role-grid"));
const emptyState = /** @type {HTMLElement} */ (document.getElementById("empty-state"));
const showNewRoleBtn = /** @type {HTMLButtonElement} */ (document.getElementById("show-new-role-btn"));
const newRoleForm = /** @type {HTMLElement} */ (document.getElementById("new-role-form"));
const roleNameInput = /** @type {HTMLInputElement} */ (document.getElementById("role-name"));
const roleContentInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("role-content"));
const saveRoleBtn = /** @type {HTMLButtonElement} */ (document.getElementById("save-role-btn"));
const cancelNewRoleBtn = /** @type {HTMLButtonElement} */ (document.getElementById("cancel-new-role-btn"));
const newRoleError = /** @type {HTMLElement} */ (document.getElementById("new-role-error"));
const deleteModal = /** @type {HTMLElement} */ (document.getElementById("delete-modal"));
const deleteRoleName = /** @type {HTMLElement} */ (document.getElementById("delete-role-name"));
const confirmDeleteBtn = /** @type {HTMLButtonElement} */ (document.getElementById("confirm-delete-btn"));
const cancelDeleteBtn = /** @type {HTMLButtonElement} */ (document.getElementById("cancel-delete-btn"));

/** @type {string | null} */
let pendingDeleteName = null;

/** @typedef {{ name: string, preview: string }} Role */

async function loadRoles() {
  const res = await fetch("/roles");
  const roles = /** @type {Role[]} */ (await res.json());
  renderRoles(roles);
}

/** @param {Role[]} roles */
function renderRoles(roles) {
  roleGrid.innerHTML = "";
  if (roles.length === 0) {
    emptyState.classList.remove("hidden");
    showNewRoleBtn.classList.add("hidden");
    newRoleForm.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");
  showNewRoleBtn.classList.remove("hidden");
  newRoleForm.classList.add("hidden");

  roles.forEach((role) => {
    const card = document.createElement("div");
    card.className =
      "relative group bg-[#111] border border-[#1e1e1e] rounded-2xl p-4 cursor-pointer hover:border-[#333] active:scale-[0.98] transition-all";
    card.innerHTML = `
      <h3 class="font-semibold text-white mb-1 truncate">${role.name}</h3>
      <p class="text-xs text-gray-400 line-clamp-3">${role.preview}</p>
      <button
        class="delete-role-btn absolute top-2 right-2 hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-red-800/70 hover:bg-red-700 text-red-200 text-xs"
        data-name="${role.name}">
        ✕
      </button>
    `;

    card.addEventListener("click", async (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest(".delete-role-btn")) return;
      // Fetch full content then navigate
      const rolesRes = await fetch("/roles");
      const allRoles = /** @type {Role[]} */ (await rolesRes.json());
      // We need the full content — re-fetch all and find this one.
      // Since GET /roles only returns preview, we need to fetch content another way.
      // Use a dedicated GET with file read — but backend only exposes preview.
      // Workaround: navigate with just the name; app.js reads role content via a GET /roles?name=...
      // Actually, per EXECUTION-PLAN Phase 4 task 6: content fetched client-side or server-side.
      // Since backend only returns preview, we'll fetch roles list and find the full preview isn't enough.
      // Best approach: let /chat load the role content from the name via query param.
      // We'll pass name and the preview is not enough — so we fetch individual file.
      // For now pass name only; app.js can call GET /roles and find preview (not ideal but works for now).
      // TODO: backend should expose GET /roles/{name} returning full content.
      const params = new URLSearchParams({ role: role.name });
      window.location.href = `/chat?${params}`;
    });

    card.querySelector(".delete-role-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      pendingDeleteName = role.name;
      deleteRoleName.textContent = role.name;
      deleteModal.classList.remove("hidden");
    });

    roleGrid.appendChild(card);
  });
}

showNewRoleBtn.addEventListener("click", () => {
  newRoleForm.classList.remove("hidden");
  showNewRoleBtn.classList.add("hidden");
  roleNameInput.focus();
});

cancelNewRoleBtn.addEventListener("click", () => {
  newRoleForm.classList.add("hidden");
  showNewRoleBtn.classList.remove("hidden");
  roleNameInput.value = "";
  roleContentInput.value = "";
  newRoleError.classList.add("hidden");
});

saveRoleBtn.addEventListener("click", async () => {
  const name = roleNameInput.value.trim();
  const content = roleContentInput.value.trim();
  newRoleError.classList.add("hidden");

  if (!name) {
    newRoleError.textContent = "Role name cannot be empty.";
    newRoleError.classList.remove("hidden");
    return;
  }

  const res = await fetch("/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
  });

  if (!res.ok) {
    const body = await res.json();
    newRoleError.textContent = body.detail ?? "Error saving role.";
    newRoleError.classList.remove("hidden");
    return;
  }

  const params = new URLSearchParams({ role: name, content });
  window.location.href = `/chat?${params}`;
});

cancelDeleteBtn.addEventListener("click", () => {
  deleteModal.classList.add("hidden");
  pendingDeleteName = null;
});

confirmDeleteBtn.addEventListener("click", async () => {
  if (!pendingDeleteName) return;
  await fetch(`/roles/${encodeURIComponent(pendingDeleteName)}`, { method: "DELETE" });
  deleteModal.classList.add("hidden");
  pendingDeleteName = null;
  await loadRoles();
});

loadRoles();
