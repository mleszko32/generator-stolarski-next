// src/ui/hardwareList.js
// Wydruk listy zakupów (okucia) całego projektu.
import { calculateProjectHardware } from "../engine/cabinet.js";
import { state } from "../core/state.js";
import { escapeHtml } from "../utils/dom.js";

export function printHardwareList() {
  const projectHardware = calculateProjectHardware();
    if (projectHardware.length === 0) {
        alert("Lista zakupów jest pusta.");
        return;
    }
    
    const dateStr = new Date().toLocaleDateString('pl-PL');
    
    let htmlContent = `
      <!DOCTYPE html>
      <html lang="pl">
      <head>
          <meta charset="UTF-8">
          <title>Lista Zakupów - ${escapeHtml(state.project.name)}</title>
          <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; max-width: 900px; margin: 0 auto; }
              .header { border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
              .header h1 { margin: 0; color: #0f172a; font-size: 28px; }
              .header p { margin: 5px 0 0 0; color: #64748b; font-size: 14px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
              th { background-color: #f8fafc; color: #334155; font-weight: bold; border-bottom: 2px solid #cbd5e1; }
              td.qty { font-weight: bold; color: #0f172a; text-align: center; width: 80px; font-size: 15px; }
              td.unit { color: #64748b; text-align: center; width: 80px; }
              tr:nth-child(even) { background-color: #f8fafc; }
              
              @media print {
                  body { padding: 0; max-width: 100%; }
                  .no-print { display: none !important; }
                  .header { border-bottom: 2px solid #000; }
                  th { border-bottom: 2px solid #000; background-color: transparent; }
                  tr:nth-child(even) { background-color: transparent; }
              }
          </style>
      </head>
      <body>
          <div class="no-print" style="margin-bottom: 30px; display: flex; justify-content: flex-end;">
              <button onclick="window.print()" style="padding: 12px 24px; background-color: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                  🖨️ Drukuj / Zapisz jako PDF
              </button>
          </div>
          <div class="header">
              <div>
                  <h1>Lista Zakupów: Okucia</h1>
                  <p>Projekt: <strong style="color: #0f172a;">${escapeHtml(state.project.name)}</strong></p>
              </div>
              <div style="text-align: right; color: #64748b; font-size: 14px;">
                  Data wygenerowania: <strong>${dateStr}</strong>
              </div>
          </div>
          <table>
              <thead>
                  <tr>
                      <th>Nazwa okucia / Elementu</th>
                      <th style="text-align: center;">Ilość</th>
                      <th style="text-align: center;">J.m.</th>
                  </tr>
              </thead>
              <tbody>
    `;
    
    projectHardware.forEach(hw => {
        htmlContent += `
          <tr>
              <td>${escapeHtml(hw.name)}</td>
              <td class="qty">${hw.qty}</td>
              <td class="unit">${escapeHtml(hw.unit)}</td>
          </tr>
        `;
    });
    
    htmlContent += `
              </tbody>
          </table>
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;">
              Wygenerowano automatycznie z systemu Generator Stolarski Next
          </div>
      </body>
      </html>
    `;
    
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    window.open(URL.createObjectURL(blob), '_blank');
}
