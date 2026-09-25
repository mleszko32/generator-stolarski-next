// src/ui/moduleLibraryModal.js
// Okno "Biblioteka szafek": zapis aktywnej szafki jako szablon, wstawianie
// szablonu do projektu, eksport/import pliku JSON (przenoszenie między komputerami).
import { getActiveModule, addModuleFromTemplate } from "../core/state.js";
import { listTemplates, saveTemplate, deleteTemplate, exportLibraryJson, importLibraryJson } from "../core/moduleLibrary.js";
import { showCustomDialog } from "../core/storage.js";
import { escapeHtml } from "../utils/dom.js";
import { openModal } from "../utils/modal.js";

const TYPE_LABELS = {
  base_cabinet: "Szafka dolna",
  upper_cabinet: "Szafka wisząca",
  tall_cabinet: "Słupek",
  corner_cabinet: "Szafka narożna",
};

const dim = (v) => Math.round((parseFloat(v) || 0) * 10) / 10;

// onChange: wołane po wstawieniu szafki do projektu (odświeżenie widoków).
export function openModuleLibrary(onChange) {
  document.getElementById("module-library-overlay")?.remove();

  const dlg = openModal({
    title: "Biblioteka szafek",
    subtitle: "Zapisz skonfigurowaną szafkę (wymiary, półki, fronty, szuflady) i wstawiaj ją do dowolnego projektu. Szablony są w tej przeglądarce; do przeniesienia na inny komputer użyj eksportu.",
    width: 580,
    body: `
      <div class="btn-row" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        <button id="lib-save" type="button" class="btn btn-sm btn-primary"></button>
        <button id="lib-export" type="button" class="btn btn-sm"><i class="ti ti-download" aria-hidden="true"></i> Eksport (plik JSON)</button>
        <button id="lib-import" type="button" class="btn btn-sm"><i class="ti ti-upload" aria-hidden="true"></i> Import z pliku</button>
        <input id="lib-file" type="file" accept="application/json,.json" style="display:none">
      </div>
      <div id="lib-list"></div>`,
    footer: [{ label: "Zamknij" }],
  });
  dlg.overlay.id = "module-library-overlay";

  const box = dlg.bodyEl;
  const listEl = box.querySelector("#lib-list");
  const saveBtn = box.querySelector("#lib-save");

  function renderSaveButton() {
    const active = getActiveModule();
    saveBtn.disabled = !active;
    saveBtn.innerHTML = active
      ? `<i class="ti ti-device-floppy" aria-hidden="true"></i> Zapisz „${escapeHtml(active.name)}" jako szablon`
      : "Wybierz szafkę, żeby zapisać szablon";
  }

  function renderList() {
    const templates = listTemplates();
    if (templates.length === 0) {
      listEl.innerHTML = `<div class="empty-note">Biblioteka jest pusta. Wybierz szafkę na liście i zapisz ją jako szablon.</div>`;
      return;
    }
    listEl.innerHTML = "";
    templates.forEach((t) => {
      const d = t.module.dimensions || {};
      const row = document.createElement("div");
      row.className = "list-row";
      row.innerHTML = `<div class="grow">
          <div class="list-row-title">${escapeHtml(t.name)}</div>
          <div class="list-row-sub">${escapeHtml(TYPE_LABELS[t.type] || "Szafka")} · ${dim(d.width)} × ${dim(d.height)} × ${dim(d.depth)} mm · elementów: ${(t.module.elements || []).length}</div>
        </div>
        <button type="button" class="btn btn-sm btn-primary lib-insert">Wstaw do projektu</button>
        <button type="button" class="btn btn-sm btn-danger lib-del" title="Usuń szablon z biblioteki"><i class="ti ti-trash" aria-hidden="true"></i></button>`;

      row.querySelector(".lib-insert").onclick = () => {
        addModuleFromTemplate(t.module);
        dlg.close();
        if (onChange) onChange();
      };
      row.querySelector(".lib-del").onclick = async () => {
        const ok = await showCustomDialog("confirm", "Usuwanie szablonu", `Usunąć szablon „${t.name}" z biblioteki?`, "", "Usuń", "Zostaw");
        if (!ok) return;
        deleteTemplate(t.id);
        renderList();
      };
      listEl.appendChild(row);
    });
  }

  saveBtn.onclick = async () => {
    const active = getActiveModule();
    if (!active) return;
    const name = await showCustomDialog("prompt", "Zapisz szablon", "Nazwa szablonu:", active.name, "Zapisz", "Anuluj");
    if (!name || !String(name).trim()) return;
    if (!saveTemplate(active, String(name))) {
      alert("❌ Nie udało się zapisać szablonu (brak miejsca w przeglądarce?).");
      return;
    }
    renderList();
  };

  box.querySelector("#lib-export").onclick = () => {
    if (listTemplates().length === 0) { alert("Biblioteka jest pusta - nie ma czego eksportować."); return; }
    const blob = new Blob([exportLibraryJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "biblioteka-szafek.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const fileInput = box.querySelector("#lib-file");
  box.querySelector("#lib-import").onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const count = importLibraryJson(await file.text());
    fileInput.value = "";
    if (count < 0) alert("❌ To nie jest poprawny plik biblioteki szafek.");
    else if (count === 0) alert("W pliku nie znaleziono szafek do zaimportowania.");
    else renderList();
  };

  renderSaveButton();
  renderList();
}
