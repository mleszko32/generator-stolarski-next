// src/core/drawerAssembly.js
//
// Dział „Szuflady” (hub Produkcja i raporty): zestawienie wszystkich szuflad projektu do składania
// i zakupów. Dla każdej szuflady: szafka, system, wysokość (wariant), NL, światło wnęki LW, formatki
// skrzynki (dno, tył) i - przy szufladzie wewnętrznej MERIVOBOX - czoło systemowe Blum.
//
// Czoło szuflady wewnętrznej MERIVOBOX to NIE formatka (engine/cabinet.js: innerFrontIsSystem), tylko
// profil ZV4.1042M (1042 mm, do KB 1200) docinany na LW − 126 mm + zestaw mocowania czoła ZI4 wg
// wysokości (katalog Blum 2027/2028, s. 258 M, 262 K; E z relingiem poprzecznym ZR4.1059U). Krótkie czoła
// tnie się z jednego profilu po kilka - packCuts liczy, ile profili kupić (pierwsze dopasowanie malejąco).

import { drawerSpec } from "./drawerSpec.js";
import { drawerSystems } from "./drawerSystems.js";
import { drawerComponentsToParts, drawerHardwareKey } from "./drawerMath.js";

export const MERIVOBOX_INNER = {
  profile: { code: "ZV4.1042M", length: 1042, deduct: 126 },
  fixing: { M: "ZI4.0MS1", K: "ZI4.1KS1", E: "ZI4.2ES1" },
  // reling poprzeczny (szuflada wewn. E): LW − 111 mm (katalog Blum, MERIVOBOX – szuflada wewn. E z relingiem)
  rail: { code: "ZR4.1059U", length: 1059, deduct: 111 },
};
export const PROFILE_KERF = 4;   // domyślny rzaz piły przy docinaniu profili [mm] (piła formatowa 3 mm + zapas)

// Rzaz z ustawień projektu (project.drawerAssembly.kerf, pole w dziale Szuflady).
export function profileKerf(project) {
  const v = parseFloat(project && project.drawerAssembly && project.drawerAssembly.kerf);
  return Number.isFinite(v) && v >= 0 ? v : PROFILE_KERF;
}

const r1 = (v) => Math.round((Number(v) || 0) * 10) / 10;

// Czoło systemowe szuflady wewnętrznej; null = system bez czoła systemowego w katalogu aplikacji
// (skrzynka drewniana MOVENTO ma czoło z płyty - formatka, inne systemy metalowe: brak danych).
export function innerFrontSpec(systemId, type, lw) {
  if (systemId !== "merivobox" || !(lw > 0)) return null;
  const t = MERIVOBOX_INNER.fixing[type] ? type : "M"; // N nie ma szuflady wewnętrznej - najbliższa M
  const cut = r1(lw - MERIVOBOX_INNER.profile.deduct);
  return {
    profile: MERIVOBOX_INNER.profile.code, profileLength: MERIVOBOX_INNER.profile.length, cut,
    fixing: MERIVOBOX_INNER.fixing[t], fixingType: t,
    rail: t === "E" ? { code: MERIVOBOX_INNER.rail.code, length: MERIVOBOX_INNER.rail.length, cut: r1(lw - MERIVOBOX_INNER.rail.deduct) } : null,
  };
}

// Docinanie odcinków z prętów/profili długości `stock` (pierwsze dopasowanie, od najdłuższych).
// Zwraca listę profili: [{ cuts: [mm…], rest }]; odcinek dłuższy niż profil - osobny profil z rest < 0.
export function packCuts(cuts, stock, kerf = PROFILE_KERF) {
  const bars = [];
  [...cuts].sort((a, b) => b - a).forEach((c) => {
    const bar = bars.find((b) => b.rest >= c + (b.cuts.length ? kerf : 0));
    if (bar) { bar.rest -= c + (bar.cuts.length ? kerf : 0); bar.cuts.push(c); }
    else bars.push({ cuts: [c], rest: stock - c });
  });
  return bars.map((b) => ({ cuts: b.cuts, rest: r1(b.rest) }));
}

// Wszystkie szuflady projektu (zwykłe szafki; skos i narożna mają własne ścieżki szuflad).
export function collectDrawers(project) {
  const out = [];
  (project.modules || []).forEach((mod) => {
    if (mod.type === "slope_cabinet" || mod.type === "corner_cabinet") return;
    (mod.elements || []).filter((el) => el.typ === "front" && /^szuflada/.test(el.subtype || "")).forEach((el) => {
      if (!(el.w >= 1)) return; // szuflada szafki ślepej przycięta do zera
      const spec = drawerSpec(mod, el, project);
      const comps = spec.comps;
      const sys = drawerSystems[spec.system] || {};
      const inner = el.subtype === "szuflada-wewnetrzna";
      const type = comps ? (comps.woodenBox ? `H${comps.sideHeight}` : comps.back.variantType) : "";
      const lw = r1(spec.openingW);
      out.push({
        module: mod.name, moduleId: mod.id, elementId: el.id, inner,
        systemId: spec.system, system: sys.name || spec.system, woodenBox: !!sys.woodenBox,
        type, nl: spec.nl, lw,
        front: inner ? null : { w: r1(el.w), h: r1(el.h) },
        parts: comps ? drawerComponentsToParts(comps) : [],
        hardwareKey: comps ? drawerHardwareKey(spec.system, comps) : null,
        innerFront: inner ? innerFrontSpec(spec.system, type, lw) : null,
        fits: spec.fitsDepth && spec.fitsHeight,
      });
    });
  });
  return out;
}

// Elementy czoła szuflad wewnętrznych do kupienia: profile (po docięciu), mocowania, relingi.
// Komplety prowadnic/boków liczy jak dotąd lista okuć (drawerHardwareKey).
export function innerFrontPurchases(drawers, kerf = PROFILE_KERF) {
  const fronts = drawers.map((d) => d.innerFront).filter(Boolean);
  if (!fronts.length) return { items: [], profiles: [], rails: [] };
  const profiles = packCuts(fronts.map((f) => f.cut), MERIVOBOX_INNER.profile.length, kerf);
  const rails = packCuts(fronts.filter((f) => f.rail).map((f) => f.rail.cut), MERIVOBOX_INNER.rail.length, kerf);
  const fixings = {};
  fronts.forEach((f) => { fixings[f.fixing] = { type: f.fixingType, qty: ((fixings[f.fixing] || {}).qty || 0) + 1 }; });
  const items = [
    { name: `Czoło szuflady wewn. MERIVOBOX ${MERIVOBOX_INNER.profile.code} (profil ${MERIVOBOX_INNER.profile.length} mm do docięcia)`, qty: profiles.length, unit: "szt." },
    ...Object.entries(fixings).map(([code, f]) => ({ name: `Mocowanie czoła szuflady wewn. MERIVOBOX ${code} (wys. ${f.type}${f.type === "E" ? ", z relingiem" : ""})`, qty: f.qty, unit: "kpl." })),
  ];
  if (rails.length) items.push({ name: `Reling poprzeczny do czoła szuflady wewn. MERIVOBOX ${MERIVOBOX_INNER.rail.code} (${MERIVOBOX_INNER.rail.length} mm do docięcia)`, qty: rails.length, unit: "szt." });
  return { items, profiles, rails };
}
