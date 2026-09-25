// src/ui/versionHistory.js
// Okno historii wersji projektu: lista zapisanych stanów z chmury i przywracanie.
// Wersje powstają w core/storage.js przed nadpisaniem projektu (zapis ręczny,
// autozapis) i przed przywróceniem starszej wersji.
import { state } from "../core/state.js";
import { listProjectVersions, restoreProjectVersion, deleteProjectVersion, showCustomDialog } from "../core/storage.js";
import { escapeHtml } from "../utils/dom.js";

function formatWhen(ts) {
  const d = new Date(ts);
  const day = d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

function formatAgo(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "przed chwilą";
  if (min < 60) return `${min} min temu`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} godz. temu`;
  return `${Math.round(h / 24)} dn. temu`;
}

// onRestored: wołane po udanym przywróceniu - odświeża widok aplikacji.
export async function openVersionHistory(onRestored) {
  const projectId = state.loadedProjectId;
  if (!projectId) {
    alert("Historia wersji jest dostępna dla projektu zapisanego w chmurze. Najpierw zapisz albo wczytaj projekt.");
    return;
  }

  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
    backgroundColor: "rgba(0,0,0,0.6)", zIndex: "9999", display: "flex",
    alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)"
  });
  const box = document.createElement("div");
  Object.assign(box.style, {
    backgroundColor: "#fff", padding: "24px", borderRadius: "8px", width: "520px",
    maxWidth: "94vw", maxHeight: "82vh", display: "flex", flexDirection: "column",
    boxShadow: "0 10px 25px rgba(0,0,0,0.3)", fontFamily: "sans-serif"
  });
  box.innerHTML = `
    <h3 style="margin:0 0 4px; color:#1e293b;">Historia wersji</h3>
    <div style="font-size:13px; color:#64748b; margin-bottom:14px;">Projekt: <b>${escapeHtml(projectId)}</b>. Wersja powstaje przed nadpisaniem projektu w chmurze (zapis ręczny, autozapis co najwyżej raz na 10 min) i przed każdym przywróceniem.</div>
    <div id="vh-list" style="overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding-right:4px;"><div style="color:#64748b; font-size:14px;">Wczytuję listę…</div></div>
    <button id="vh-close" style="margin-top:18px; padding:10px; width:100%; cursor:pointer; background:#94a3b8; color:#fff; border:none; border-radius:6px; font-weight:bold;">Zamknij okno</button>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const listEl = box.querySelector("#vh-list");
  const close = () => overlay.remove();
  box.querySelector("#vh-close").onclick = close;
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });

  async function render() {
    const versions = await listProjectVersions(projectId);
    if (versions === null) {
      listEl.innerHTML = `<div style="color:#b91c1c; font-size:14px;">Nie udało się pobrać historii. Jeśli działa to pierwszy raz, opublikuj aktualne reguły z pliku <code>firestore.rules</code> w konsoli Firebase (patrz FIREBASE.md).</div>`;
      return;
    }
    if (versions.length === 0) {
      listEl.innerHTML = `<div style="color:#64748b; font-size:14px;">Brak zapisanych wersji. Pierwsza pojawi się przy następnym zapisie projektu.</div>`;
      return;
    }
    listEl.innerHTML = "";
    versions.forEach((v) => {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px",
        border: "1px solid #cbd5e1", borderRadius: "6px", background: "#f8fafc"
      });
      const info = document.createElement("div");
      info.style.flex = "1";
      info.innerHTML = `
        <div style="font-size:14px; color:#1e293b;"><b>${escapeHtml(formatWhen(v.createdAt))}</b> <span style="color:#64748b; font-size:12px;">(${escapeHtml(formatAgo(v.createdAt))})</span></div>
        <div style="font-size:12px; color:#64748b;">${escapeHtml(v.label || "Wersja")} · ${v.moduleCount ?? "?"} szafek · ${v.sizeKB ?? "?"} KB${v.author ? " · " + escapeHtml(v.author) : ""}</div>`;

      const btnRestore = document.createElement("button");
      btnRestore.textContent = "Przywróć";
      Object.assign(btnRestore.style, {
        padding: "8px 12px", cursor: "pointer", background: "#2563eb", color: "#fff",
        border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "13px"
      });
      btnRestore.onclick = async () => {
        const ok = await showCustomDialog(
          "confirm", "Przywrócenie wersji",
          `Przywrócić stan projektu z ${formatWhen(v.createdAt)}? Bieżący stan zostanie zachowany w historii, więc przywrócenie da się cofnąć.`,
          "", "Przywróć", "Anuluj"
        );
        if (!ok) return;
        btnRestore.disabled = true;
        btnRestore.textContent = "Przywracam…";
        const done = await restoreProjectVersion(projectId, v.id);
        if (done) {
          close();
          if (onRestored) onRestored();
        } else {
          btnRestore.disabled = false;
          btnRestore.textContent = "Przywróć";
        }
      };

      const btnDel = document.createElement("button");
      btnDel.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
      btnDel.title = "Usuń tę wersję z historii";
      Object.assign(btnDel.style, {
        padding: "8px 10px", cursor: "pointer", background: "#fee2e2", color: "#991b1b",
        border: "1px solid #fca5a5", borderRadius: "6px"
      });
      btnDel.onclick = async () => {
        const ok = await showCustomDialog("confirm", "Usuwanie wersji", "Usunąć tę wersję z historii? Tej operacji nie można cofnąć.", "", "Usuń", "Zostaw");
        if (!ok) return;
        if (await deleteProjectVersion(projectId, v.id)) row.remove();
      };

      row.appendChild(info);
      row.appendChild(btnRestore);
      row.appendChild(btnDel);
      listEl.appendChild(row);
    });
  }

  render();
}
