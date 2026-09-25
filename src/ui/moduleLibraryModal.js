// src/ui/moduleLibraryModal.js
// Okno "Biblioteka szafek": zapis aktywnej szafki jako szablon, wstawianie
// szablonu do projektu, eksport/import pliku JSON (przenoszenie między komputerami).
import { state, getActiveModule, addModuleFromTemplate } from "../core/state.js";
import { listTemplates, saveTemplate, deleteTemplate, exportLibraryJson, importLibraryJson } from "../core/moduleLibrary.js";
import { showCustomDialog } from "../core/storage.js";
import { escapeHtml } from "../utils/dom.js";

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
  const overlay = document.createElement("div");
  overlay.id = "module-library-overlay";
  Object.assign(overlay.style, {
    position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
    backgroundColor: "rgba(0,0,0,0.6)", zIndex: "9999", display: "flex",
    alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)"
  });
  const box = document.createElement("div");
  Object.assign(box.style, {
    backgroundColor: "#fff", padding: "24px", borderRadius: "8px", width: "560px",
    maxWidth: "94vw", maxHeight: "82vh", display: "flex", flexDirection: "column",
    boxShadow: "0 10px 25px rgba(0,0,0,0.3)", fontFamily: "sans-serif"
  });
  box.innerHTML = `
    <h3 style="margin:0 0 4px; color:#1e293b;">Biblioteka szafek</h3>
    <div style="font-size:13px; color:#64748b; margin-bottom:14px;">Zapisz skonfigurowaną szafkę (wymiary, półki, fronty, szuflady) i wstawiaj ją do dowolnego projektu. Szablony są w tej przeglądarce; do przeniesienia na inny komputer użyj eksportu.</div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
      <button id="lib-save" class="btn btn-primary btn-sm"></button>
      <button id="lib-export" class="btn btn-sm">Eksport (plik JSON)</button>
      <button id="lib-import" class="btn btn-sm">Import z pliku</button>
      <input id="lib-file" type="file" accept="application/json,.json" style="display:none">
    </div>
    <div id="lib-list" style="overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding-right:4px;"></div>
    <button id="lib-close" style="margin-top:18px; padding:10px; width:100%; cursor:pointer; background:#94a3b8; color:#fff; border:none; border-radius:6px; font-weight:bold;">Zamknij okno</button>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const listEl = box.querySelector("#lib-list");
  const saveBtn = box.querySelector("#lib-save");
  const close = () => overlay.remove();
  box.querySelector("#lib-close").onclick = close;
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });

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
      listEl.innerHTML = `<div style="color:#64748b; font-size:14px;">Biblioteka jest pusta. Wybierz szafkę na liście i zapisz ją jako szablon.</div>`;
      return;
    }
    listEl.innerHTML = "";
    templates.forEach((t) => {
      const d = t.module.dimensions || {};
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px",
        border: "1px solid #cbd5e1", borderRadius: "6px", background: "#f8fafc"
      });
      const info = document.createElement("div");
      info.style.flex = "1";
      info.innerHTML = `<div style="font-size:14px; color:#1e293b;"><b>${escapeHtml(t.name)}</b></div>
        <div style="font-size:12px; color:#64748b;">${escapeHtml(TYPE_LABELS[t.type] || "Szafka")} · ${dim(d.width)} × ${dim(d.height)} × ${dim(d.depth)} mm · elementów: ${(t.module.elements || []).length}</div>`;

      const btnInsert = document.createElement("button");
      btnInsert.textContent = "Wstaw do projektu";
      Object.assign(btnInsert.style, {
        padding: "8px 12px", cursor: "pointer", background: "#2563eb", color: "#fff",
        border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "13px"
      });
      btnInsert.onclick = () => {
        addModuleFromTemplate(t.module);
        close();
        if (onChange) onChange();
      };

      const btnDel = document.createElement("button");
      btnDel.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
      btnDel.title = "Usuń szablon z biblioteki";
      Object.assign(btnDel.style, {
        padding: "8px 10px", cursor: "pointer", background: "#fee2e2", color: "#991b1b",
        border: "1px solid #fca5a5", borderRadius: "6px"
      });
      btnDel.onclick = async () => {
        const ok = await showCustomDialog("confirm", "Usuwanie szablonu", `Usunąć szablon „${t.name}" z biblioteki?`, "", "Usuń", "Zostaw");
        if (!ok) return;
        deleteTemplate(t.id);
        renderList();
      };

      row.appendChild(info);
      row.appendChild(btnInsert);
      row.appendChild(btnDel);
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
