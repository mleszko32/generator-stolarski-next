// src/ui/versionHistory.js
// Okno historii wersji projektu: lista zapisanych stanów z chmury i przywracanie.
// Wersje powstają w core/storage.js przed nadpisaniem projektu (zapis ręczny,
// autozapis) i przed przywróceniem starszej wersji.
import { state } from "../core/state.js";
import { listProjectVersions, restoreProjectVersion, deleteProjectVersion, showCustomDialog } from "../core/storage.js";
import { escapeHtml } from "../utils/dom.js";
import { openModal } from "../utils/modal.js";

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

  const dlg = openModal({
    title: "Historia wersji",
    subtitle: `Projekt: ${projectId}. Wersja powstaje przed nadpisaniem projektu w chmurze (zapis ręczny, autozapis co najwyżej raz na 10 min) i przed każdym przywróceniem.`,
    width: 560,
    body: '<div id="vh-list"><div class="empty-note">Wczytuję listę…</div></div>',
    footer: [{ label: "Zamknij" }],
  });
  const listEl = dlg.bodyEl.querySelector("#vh-list");

  const versions = await listProjectVersions(projectId);
  if (versions === null) {
    listEl.innerHTML = `<div class="notice notice-danger">Nie udało się pobrać historii. Jeśli działa to pierwszy raz, opublikuj aktualne reguły z pliku <code>firestore.rules</code> w konsoli Firebase (patrz FIREBASE.md).</div>`;
    return;
  }
  if (versions.length === 0) {
    listEl.innerHTML = `<div class="empty-note">Brak zapisanych wersji. Pierwsza pojawi się przy następnym zapisie projektu.</div>`;
    return;
  }

  listEl.innerHTML = "";
  versions.forEach((v) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `<div class="grow">
        <div class="list-row-title">${escapeHtml(formatWhen(v.createdAt))} <span class="list-row-sub">(${escapeHtml(formatAgo(v.createdAt))})</span></div>
        <div class="list-row-sub">${escapeHtml(v.label || "Wersja")} · ${v.moduleCount ?? "?"} szafek · ${v.sizeKB ?? "?"} KB${v.author ? " · " + escapeHtml(v.author) : ""}</div>
      </div>
      <button type="button" class="btn btn-sm btn-primary vh-restore">Przywróć</button>
      <button type="button" class="btn btn-sm btn-danger vh-del" title="Usuń tę wersję z historii"><i class="ti ti-trash" aria-hidden="true"></i></button>`;

    const btnRestore = row.querySelector(".vh-restore");
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
        dlg.close();
        if (onRestored) onRestored();
      } else {
        btnRestore.disabled = false;
        btnRestore.textContent = "Przywróć";
      }
    };

    row.querySelector(".vh-del").onclick = async () => {
      const ok = await showCustomDialog("confirm", "Usuwanie wersji", "Usunąć tę wersję z historii? Tej operacji nie można cofnąć.", "", "Usuń", "Zostaw");
      if (!ok) return;
      if (await deleteProjectVersion(projectId, v.id)) row.remove();
    };

    listEl.appendChild(row);
  });
}
