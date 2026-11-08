// Okno „Wczytaj projekt”: zakładki statusu (Robocze / Do wyceny / Zakończone), wyszukiwarka,
// lista od ostatnio zapisanych z datą i liczbą szafek, zmiana statusu i usuwanie.
// Logika filtrów i statusów: core/projectStatus.js.

import { openModal } from "../utils/modal.js";
import { escapeHtml } from "../utils/dom.js";
import { state } from "../core/state.js";
import { showCustomDialog, deleteProjectFromCloud, setProjectStatus } from "../core/storage.js";
import { PROJECT_STATUSES, filterProjects, countByStatus, formatSavedAt } from "../core/projectStatus.js";

let lastTab = "roboczy";

function szafkiLabel(n) {
  if (n === 1) return "1 szafka";
  const d = n % 10, dd = n % 100;
  return `${n} ${d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? "szafki" : "szafek"}`;
}

// projects: [{ id, status, savedAt, modules }] z getSavedProjectsMeta(); onOpen(id) wczytuje projekt.
export function openLoadProjectModal(projects, onOpen) {
  let tab = lastTab;
  let query = "";

  const dlg = openModal({
    title: "Wczytaj projekt",
    subtitle: "Projekty w chmurze. Otwarty projekt zostanie zastąpiony (niezapisane zmiany przepadną).",
    width: 640,
    body: `
      <div class="seg lp-tabs" role="tablist"></div>
      <input type="search" class="input lp-search" placeholder="Szukaj po nazwie…" aria-label="Szukaj projektu">
      <div class="lp-list"></div>`,
    footer: [{ label: "Zamknij" }],
  });
  const tabsEl = dlg.bodyEl.querySelector(".lp-tabs");
  const listEl = dlg.bodyEl.querySelector(".lp-list");
  const searchEl = dlg.bodyEl.querySelector(".lp-search");

  function renderTabs() {
    const counts = countByStatus(projects);
    tabsEl.innerHTML = PROJECT_STATUSES.map((s) => `
      <button type="button" class="seg-btn${s.id === tab ? " active" : ""}" data-tab="${s.id}" role="tab">
        <i class="ti ti-${s.icon}" aria-hidden="true"></i> ${s.label} <span class="lp-count">${counts[s.id]}</span>
      </button>`).join("");
  }

  function renderList() {
    // Przy wyszukiwaniu szukamy we wszystkich zakładkach — łatwiej znaleźć zarchiwizowany projekt.
    const rows = filterProjects(projects, { status: query.trim() ? null : tab, query });
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-note">${query.trim() ? "Nic nie pasuje do wyszukiwania." : "Brak projektów w tej zakładce."}</div>`;
      return;
    }
    listEl.innerHTML = rows.map((p) => {
      const sub = [formatSavedAt(p.savedAt) && `zapisano ${formatSavedAt(p.savedAt)}`, szafkiLabel(p.modules)].filter(Boolean).join(" · ");
      const isOpen = p.id === state.loadedProjectId;
      const statusName = PROJECT_STATUSES.find((s) => s.id === p.status).label;
      return `
      <div class="list-row" data-id="${escapeHtml(p.id)}">
        <i class="ti ti-${p.status === "zakonczony" ? "archive" : "folder"} li-icon" aria-hidden="true"></i>
        <div class="grow">
          <div class="list-row-title">${escapeHtml(p.id)} ${isOpen ? '<span class="badge badge-info">otwarty</span>' : ""}
            ${query.trim() ? `<span class="badge badge-${p.status === "wycena" ? "warn" : p.status === "zakonczony" ? "success" : "info"}">${statusName}</span>` : ""}</div>
          <div class="list-row-sub">${sub}</div>
        </div>
        <select class="input lp-status" title="Status projektu" aria-label="Status projektu">
          ${PROJECT_STATUSES.map((s) => `<option value="${s.id}"${s.id === p.status ? " selected" : ""}>${s.label}</option>`).join("")}
        </select>
        <button type="button" class="btn btn-sm btn-primary lp-open">Wczytaj</button>
        <button type="button" class="btn btn-sm btn-danger lp-del" title="Usuń projekt bezpowrotnie" aria-label="Usuń projekt"><i class="ti ti-trash" aria-hidden="true"></i></button>
      </div>`;
    }).join("");
  }

  const render = () => { renderTabs(); renderList(); };
  const findProject = (rowEl) => projects.find((p) => p.id === rowEl.dataset.id);

  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    tab = lastTab = btn.dataset.tab;
    query = "";
    searchEl.value = "";
    render();
  });
  searchEl.addEventListener("input", () => { query = searchEl.value; renderList(); });

  listEl.addEventListener("click", async (e) => {
    const row = e.target.closest(".list-row");
    if (!row) return;
    const p = findProject(row);
    if (e.target.closest(".lp-open")) {
      dlg.close();
      onOpen(p.id);
    } else if (e.target.closest(".lp-del")) {
      const ok = await showCustomDialog("confirm", "Usuwanie projektu",
        `Czy na pewno chcesz usunąć projekt "${p.id}" z chmury? Tej operacji NIE można cofnąć!\n\nJeśli projekt jest skończony, lepiej oznacz go jako „Zakończone” — zniknie z roboczych, a zostanie w archiwum.`,
        "", "Usuń trwale", "Zostaw");
      if (ok && await deleteProjectFromCloud(p.id)) {
        projects.splice(projects.indexOf(p), 1);
        render();
      }
    }
  });

  listEl.addEventListener("change", async (e) => {
    const sel = e.target.closest(".lp-status");
    if (!sel) return;
    const p = findProject(sel.closest(".list-row"));
    sel.disabled = true;
    if (await setProjectStatus(p.id, sel.value)) p.status = sel.value;
    render();
  });

  render();
  searchEl.focus();
}
