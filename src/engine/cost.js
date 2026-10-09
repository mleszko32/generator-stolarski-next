// src/engine/cost.js
//
// Kosztorys projektu (materiały, cięcie, okucia, robocizna, lakiernia, marża, rabat, VAT) - wydzielony
// z engine/cabinet.js.
import { state, migratePricingExtras } from "../core/state.js";
import { calculateAllProjectParts } from "./cabinet.js";
import { calculateProjectHardware } from "./hardware.js";

// Szacunkowy kosztorys materiałowy - liczy powierzchnię formatek Z OSOBNA dla
// każdej kategorii (Korpus/Front/Szuflada/Plecy, patrz PRICING_MATERIAL_
// CATEGORIES w core/state.js), a nie jedną wspólną "płytą" - front to zwykle
// inny, droższy materiał niż korpus (lakier, fornir, okleina), więc jedna
// cena za m² dla obu myliła realny koszt (zgłoszona uwaga). Do tego koszt
// każdej pozycji okuć z listy zakupów, po cenach z state.project.pricing
// (patrz core/state.js: ensurePricingDefaults). Ceny okuć trzymane są w
// słowniku nazwa->cena, bo lista okuć jest dynamiczna (np. różne warianty
// wysokości nóżek w tym samym projekcie) - nie da się z góry przewidzieć
// stałego zestawu pozycji do wycenienia. Tylko kategorie faktycznie obecne
// w projekcie trafiają do wyniku (np. projekt bez szuflad nie pokaże
// pustego wiersza "Szuflada").
const MATERIAL_CATEGORY_ORDER = ['Korpus', 'Front', 'Szuflada', 'Plecy', 'Blat'];

// Formatki cięte w hurtowni (płyta korpusowa, MDF frontów, HDF pleców) - blat
// docina się na miejscu, więc nie wchodzi do liczby cięć.
const CUT_CATEGORIES = ['Korpus', 'Front', 'Szuflada', 'Plecy'];

export function calculateProjectCost() {
  const pricing = migratePricingExtras({ materials: {}, marginPercent: 0, hardware: {}, ...(state.project.pricing || {}) });
  const parts = calculateAllProjectParts();
  const hardware = calculateProjectHardware();

  // Fronty mają WŁASNY katalog materiałów (pricing.frontMaterials, core/
  // state.js), nie jedną wspólną cenę jak pozostałe kategorie - front bez
  // wybranego materiału (front.materialId nieustawione) ORAZ front, którego
  // materiał ktoś skasował z katalogu (stara, nieistniejąca już referencja),
  // po cichu ląduje na PIERWSZYM wpisie katalogu zamiast pokazywać osobny,
  // mylący wiersz "nieznany materiał, 0 zł".
  const frontCatalog = Array.isArray(pricing.frontMaterials) && pricing.frontMaterials.length
    ? pricing.frontMaterials
    : [{ id: 'default', name: 'Standard', pricePerM2: 0 }];
  const frontMaterialById = Object.fromEntries(frontCatalog.map(m => [m.id, m]));
  const resolveFrontMaterial = (materialId) => (materialId && frontMaterialById[materialId]) || frontCatalog[0];

  const areaMm2ByKey = {}; // klucz = kategoria, albo "Front::<materialId>" dla frontów
  parts.forEach(p => {
    const areaMm2 = (parseFloat(p.length) || 0) * (parseFloat(p.width) || 0) * (parseFloat(p.qty) || 0);
    const cat = p.category || 'Inne';
    const key = cat === 'Front' ? `Front::${resolveFrontMaterial(p.materialId).id}` : cat;
    areaMm2ByKey[key] = (areaMm2ByKey[key] || 0) + areaMm2;
  });

  const frontOrderIndex = (id) => { const i = frontCatalog.findIndex(m => m.id === id); return i === -1 ? 99 : i; };
  const keys = Object.keys(areaMm2ByKey).sort((a, b) => {
    const catA = a.startsWith('Front::') ? 'Front' : a;
    const catB = b.startsWith('Front::') ? 'Front' : b;
    const ia = MATERIAL_CATEGORY_ORDER.indexOf(catA);
    const ib = MATERIAL_CATEGORY_ORDER.indexOf(catB);
    const byCat = (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    if (byCat !== 0) return byCat;
    if (catA === 'Front') return frontOrderIndex(a.slice(7)) - frontOrderIndex(b.slice(7));
    return 0;
  });

  const materials = keys.map(key => {
    const areaM2 = areaMm2ByKey[key] / 1e6;
    if (key.startsWith('Front::')) {
      const mat = frontMaterialById[key.slice(7)] || frontCatalog[0];
      const pricePerM2 = parseFloat(mat.pricePerM2) || 0;
      return { category: 'Front', materialId: mat.id, materialName: mat.name, areaM2, pricePerM2, cost: areaM2 * pricePerM2 };
    }
    const pricePerM2 = parseFloat((pricing.materials || {})[key]) || 0;
    return { category: key, areaM2, pricePerM2, cost: areaM2 * pricePerM2 };
  });

  const hardwareLines = hardware.map(hw => {
    const price = parseFloat((pricing.hardware || {})[hw.name]) || 0;
    return { ...hw, price, cost: hw.qty * price };
  });

  const materialsSubtotal = materials.reduce((sum, m) => sum + m.cost, 0);
  const hardwareSubtotal = hardwareLines.reduce((sum, l) => sum + l.cost, 0);
  const cutPartsCount = parts
    .filter(p => CUT_CATEGORIES.includes(p.category))
    .reduce((sum, p) => sum + (parseFloat(p.qty) || 0), 0);
  const cuttingCost = cutPartsCount * pricing.cuttingPerPart;
  const laborCost = pricing.labor.hours * pricing.labor.rate;
  const lacquerCost = pricing.lacquer.hours * pricing.lacquer.rate;
  const assemblyCost = pricing.assembly.hours * pricing.assembly.rate;
  const transportCost = pricing.transport;
  // suma kosztów = materiały + cięcie + okucia + robocizna + lakiernia + montaż + transport;
  // narzut na materiały (z cięciem i okuciami) i marża na pracę (z montażem i
  // transportem) osobno, rabat od ceny po marży, VAT od ceny po rabacie
  const goodsSubtotal = materialsSubtotal + cuttingCost + hardwareSubtotal;
  const workSubtotal = laborCost + lacquerCost + assemblyCost + transportCost;
  const subtotal = goodsSubtotal + workSubtotal;
  const marginPercent = parseFloat(pricing.marginPercent) || 0;
  const laborMarginPercent = pricing.laborMarginPercent;
  const goodsMarginAmount = goodsSubtotal * (marginPercent / 100);
  const laborMarginAmount = workSubtotal * (laborMarginPercent / 100);
  const marginAmount = goodsMarginAmount + laborMarginAmount;
  const priceBeforeDiscount = subtotal + marginAmount;
  const discountAmount = priceBeforeDiscount * (pricing.discountPercent / 100);
  const net = priceBeforeDiscount - discountAmount;
  const vatAmount = net * (pricing.vatPercent / 100);

  return {
    materials,
    hardware: hardwareLines,
    materialsSubtotal,
    hardwareSubtotal,
    cutPartsCount,
    cuttingCost,
    laborCost,
    lacquerCost,
    assemblyCost,
    transportCost,
    subtotal,
    goodsSubtotal,
    workSubtotal,
    marginPercent,
    laborMarginPercent,
    goodsMarginAmount,
    laborMarginAmount,
    marginAmount,
    priceBeforeDiscount,
    discountPercent: pricing.discountPercent,
    discountAmount,
    net,
    vatPercent: pricing.vatPercent,
    vatAmount,
    gross: net + vatAmount,
    total: net
  };
}
