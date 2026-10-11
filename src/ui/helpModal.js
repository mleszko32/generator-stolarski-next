// src/ui/helpModal.js
//
// Okno „Pomoc” (przycisk na górnym pasku, klawisz F1): spis treści po lewej, rozdział po
// prawej, wyszukiwarka filtrująca rozdziały po tekście. Treść w ui/helpContent.js.
import { openModal } from "../utils/modal.js";
import { escapeHtml } from "../utils/dom.js";
import { HELP_SECTIONS } from "./helpContent.js";

let open = null; // otwarte okno - drugie F1 go nie dubluje

// Czysty tekst rozdziału (do wyszukiwania).
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();

export function openHelp(sectionId = HELP_SECTIONS[0].id) {
  if (open) { show(sectionId); return; }

  const body = document.createElement("div");
  body.className = "help";
  body.innerHTML = `
    <nav class="help-nav">
      <input type="search" class="input help-search" placeholder="Szukaj w instrukcji…" aria-label="Szukaj w instrukcji">
      <div class="help-toc">${HELP_SECTIONS.map((s) => `
        <button type="button" class="help-toc-item" data-id="${escapeHtml(s.id)}">
          <i class="ti ti-${escapeHtml(s.icon)}" aria-hidden="true"></i> ${escapeHtml(s.title)}
        </button>`).join("")}
      </div>
      <div class="empty-note help-empty" hidden>Nic nie znaleziono.</div>
    </nav>
    <article class="help-content"></article>`;

  const dlg = openModal({
    title: "Instrukcja obsługi",
    width: 980,
    body,
    footer: [{ label: "Zamknij" }],
    onClose: () => { open = null; },
  });
  open = { dlg, body };

  body.querySelectorAll(".help-toc-item").forEach((b) => b.addEventListener("click", () => show(b.dataset.id)));
  const search = body.querySelector(".help-search");
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    let first = null;
    body.querySelectorAll(".help-toc-item").forEach((b) => {
      const sec = HELP_SECTIONS.find((s) => s.id === b.dataset.id);
      const hit = !q || sec.title.toLowerCase().includes(q) || plain(sec.body).includes(q);
      b.hidden = !hit;
      if (hit && !first) first = sec.id;
    });
    body.querySelector(".help-empty").hidden = !!first;
    if (first && q) show(first);
  });

  show(sectionId);
}

function show(id) {
  if (!open) return;
  const sec = HELP_SECTIONS.find((s) => s.id === id) || HELP_SECTIONS[0];
  const content = open.body.querySelector(".help-content");
  content.innerHTML = `<h3><i class="ti ti-${escapeHtml(sec.icon)}" aria-hidden="true"></i> ${escapeHtml(sec.title)}</h3>${sec.body}`;
  content.scrollTop = 0;
  open.body.querySelectorAll(".help-toc-item").forEach((b) => b.classList.toggle("is-active", b.dataset.id === sec.id));
}
