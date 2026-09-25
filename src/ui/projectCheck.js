// src/ui/projectCheck.js
// Sekcja "Kontrola projektu" okna Produkcja: lista uwag z core/validate.js:
// kolizje szafek, wymiary względem pomieszczenia, zbyt szerokie drzwi i półki,
// formatki niemieszczące się na arkuszu.
import { escapeHtml } from "../utils/dom.js";
import { validateProject } from "../core/validate.js";

const ISSUE_STYLE = {
  error: { label: "Błąd", bg: "#fee2e2", fg: "#991b1b" },
  warn: { label: "Uwaga", bg: "#fef3c7", fg: "#92400e" },
  info: { label: "Info", bg: "#e0f2fe", fg: "#075985" },
};

// onGoto(moduleId): wołane po kliknięciu "Pokaż szafkę" (zamyka okno i wybiera szafkę).
export function renderProjectCheck(el, onGoto) {
  const { issues, counts } = validateProject();
  const problems = counts.error + counts.warn;
  const summary = problems === 0
    ? '<span style="color:#166534">✔ Nie znaleziono błędów ani ostrzeżeń.</span>'
    : `Błędy: <b>${counts.error}</b> · Ostrzeżenia: <b>${counts.warn}</b>${counts.info ? ` · Informacje: ${counts.info}` : ""}`;

  const rows = issues.map((i) => {
    const st = ISSUE_STYLE[i.level];
    return `<tr>
      <td><span style="background:${st.bg};color:${st.fg};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">${st.label}</span></td>
      <td>${escapeHtml(i.moduleName || "cały projekt")}</td>
      <td>${escapeHtml(i.message)}</td>
      <td class="num">${i.moduleId ? `<button type="button" class="btn btn-sm hub-goto" data-id="${escapeHtml(i.moduleId)}">Pokaż szafkę</button>` : ""}</td>
    </tr>`;
  }).join("");

  el.innerHTML = `
    <div class="hub-bar">
      <div><h3>Kontrola projektu</h3><div class="hub-sub">Sprawdza kolizje szafek, wymiary względem pomieszczenia, zbyt szerokie drzwi i półki oraz formatki, które nie mieszczą się na arkuszu. To podpowiedzi - część uwag może być zamierzona.</div></div>
      <div class="hub-actions"><button type="button" id="hub-recheck" class="btn btn-sm">Sprawdź ponownie</button></div>
    </div>
    <p style="font-size:14px">${summary}</p>
    ${issues.length === 0 ? "" : `<table class="hub-table"><thead><tr><th style="width:70px"></th><th>Szafka</th><th>Uwaga</th><th></th></tr></thead><tbody>${rows}</tbody></table>`}`;

  el.querySelector("#hub-recheck").addEventListener("click", () => renderProjectCheck(el, onGoto));
  el.querySelectorAll(".hub-goto").forEach((btn) => btn.addEventListener("click", () => onGoto(btn.dataset.id)));
}
