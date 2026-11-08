// Status projektu w chmurze (porządek w oknie „Wczytaj projekt”): robocze, do wyceny,
// zakończone (archiwum). Pole `status` siedzi w samym projekcie (state.project.status),
// więc zapis ręczny i autozapis go nie gubią. Brak pola = „robocze”.

export const PROJECT_STATUSES = [
  { id: "roboczy", label: "Robocze", icon: "pencil" },
  { id: "wycena", label: "Do wyceny", icon: "calculator" },
  { id: "zakonczony", label: "Zakończone", icon: "archive" },
];

const IDS = PROJECT_STATUSES.map((s) => s.id);

export function normalizeStatus(status) {
  return IDS.includes(status) ? status : "roboczy";
}

export function statusLabel(status) {
  return PROJECT_STATUSES.find((s) => s.id === normalizeStatus(status)).label;
}

// Skrót projektu do listy: z pełnych danych dokumentu tylko to, co pokazuje okno.
export function projectListEntry(id, data = {}) {
  const modules = Array.isArray(data.modules) ? data.modules.length : 0;
  const savedAt = Number.isFinite(data.savedAt) ? data.savedAt : null;
  return { id, status: normalizeStatus(data.status), savedAt, modules };
}

// Bez polskich znaków i wielkości liter — „zupnicza” znajdzie „Żupnicza”.
function fold(text) {
  return String(text || "").toLocaleLowerCase("pl").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
}

// Filtr zakładki + wyszukiwania, sortowanie: najpierw ostatnio zapisane, bez daty na końcu alfabetycznie.
export function filterProjects(list, { status, query } = {}) {
  const q = fold(query).trim();
  return list
    .filter((p) => !status || p.status === status)
    .filter((p) => !q || fold(p.id).includes(q))
    .sort((a, b) => {
      if (a.savedAt !== b.savedAt) {
        if (a.savedAt == null) return 1;
        if (b.savedAt == null) return -1;
        return b.savedAt - a.savedAt;
      }
      return a.id.localeCompare(b.id, "pl");
    });
}

export function countByStatus(list) {
  const out = Object.fromEntries(IDS.map((id) => [id, 0]));
  list.forEach((p) => { out[normalizeStatus(p.status)]++; });
  return out;
}

// „dziś 18:44”, „wczoraj 9:05”, starsze „3.11.2026”.
export function formatSavedAt(ts, now = Date.now()) {
  if (!Number.isFinite(ts)) return "";
  const d = new Date(ts);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date(now)) - day(d)) / 86400000);
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (diff === 0) return `dziś ${time}`;
  if (diff === 1) return `wczoraj ${time}`;
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}
