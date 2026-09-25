// src/utils/modal.js
// Wspólne okno dialogowe (klasy .modal-* w styles/global.css): nagłówek z tytułem,
// treść, stopka z przyciskami. Wszystkie okna aplikacji budują się przez tę
// funkcję, dzięki czemu wyglądają i zachowują się tak samo (Esc i klik w tło
// zamykają, ten sam font, odstępy i przyciski).
import { escapeHtml } from "./dom.js";

// opts: {
//   title, subtitle,            // tekst (escapowany)
//   width,                      // szerokość w px (domyślnie 520)
//   body,                       // string HTML albo Node
//   footer: [{ label, kind, icon, onClick(close) }]   // kind: 'primary' | 'danger' | '' (drugorzędny)
//   closeButton: true,          // krzyżyk w nagłówku
//   dismissable: true,          // Esc / klik w tło zamyka
//   onClose,                    // wołane po zamknięciu (każdym)
// }
// Zwraca { overlay, modal, bodyEl, footEl, close }.
export function openModal(opts = {}) {
  const {
    title = "", subtitle = "", width = 520, body = "", footer = [],
    closeButton = true, dismissable = true, onClose,
  } = opts;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.style.setProperty("--modal-w", width + "px");

  modal.innerHTML = `
    ${title ? `<div class="modal-head">
      <div><h2 class="modal-title">${escapeHtml(title)}</h2>${subtitle ? `<div class="modal-sub">${escapeHtml(subtitle)}</div>` : ""}</div>
      ${closeButton ? '<button type="button" class="modal-close" aria-label="Zamknij"><i class="ti ti-x" aria-hidden="true"></i></button>' : ""}
    </div>` : ""}
    <div class="modal-body"></div>
    ${footer.length ? '<div class="modal-foot"></div>' : ""}`;

  const bodyEl = modal.querySelector(".modal-body");
  if (typeof body === "string") bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);

  let closed = false;
  // Esc zamyka tylko okno leżące NA WIERZCHU (dialog nad oknem, okno nad raportami).
  const onKey = (e) => {
    if (e.key !== "Escape" || !dismissable) return;
    const all = document.querySelectorAll(".modal-overlay");
    if (all[all.length - 1] === overlay) close();
  };
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    if (onClose) onClose();
  }

  const footEl = modal.querySelector(".modal-foot");
  footer.forEach((f) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn" + (f.kind ? ` btn-${f.kind}` : "");
    btn.innerHTML = (f.icon ? `<i class="ti ti-${f.icon}" aria-hidden="true"></i> ` : "") + escapeHtml(f.label);
    if (f.disabled) btn.disabled = true;
    btn.addEventListener("click", () => (f.onClick ? f.onClick(close, btn) : close()));
    footEl.appendChild(btn);
  });

  const x = modal.querySelector(".modal-close");
  if (x) x.addEventListener("click", close);
  if (dismissable) overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  return { overlay, modal, bodyEl, footEl, close };
}
