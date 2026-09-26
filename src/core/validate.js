// src/core/validate.js
//
// Kontrola projektu przed produkcją: przegląda szafki i formatki i zwraca listę
// uwag (błędy / ostrzeżenia / informacje) z odnośnikiem do szafki, której
// dotyczą. Czysta logika bez DOM - okno z wynikiem jest w ui/productionHub.js.
// Sprawdzenia są celowo ostrożne (lepiej pominąć wątpliwy przypadek niż
// straszyć fałszywym alarmem): szafki narożne (odcisk L, nie prostokąt) nie
// biorą udziału w wykrywaniu kolizji między szafkami.
import { state, DEFAULT_ROOM } from "./state.js";
import { getWorldFootprint, recalculateAllLayouts } from "./layout.js";
import { getCabinetInnerRect } from "./zoneTree.js";
import { collectProjectParts } from "../engine/cabinet.js";
import { computeWallLayouts } from "./walls.js";
import { openingInstrumental, WALL_LOCATIVE } from "./openings.js";

export const MAX_DOOR_WIDTH = 600;   // szersze drzwi się wichrują / zawiasy nie dają rady
export const MAX_SHELF_SPAN = 800;   // dłuższa półka ugina się pod obciążeniem
const MIN_FRONT_SIZE = 40;
const OVERLAP_TOL = 2;               // mm - dopuszczalne "zejście się" krawędzi
const STACK_TOL = 20;                // mm - nakładanie w pionie mniejsze od tego to zwykłe piętrowanie

const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

function nameOf(mod) {
  return (mod.name || "").trim() || "Szafka bez nazwy";
}

function moduleBox(mod) {
  const { worldW, worldD } = getWorldFootprint(mod);
  const x0 = num(mod.position && mod.position.x);
  const z0 = num(mod.position && mod.position.z);
  const y0 = num(mod.position && mod.position.y);
  const legs = mod.legs && mod.legs.active ? num(mod.legs.height) : 0;
  const height = num(mod.dimensions && mod.dimensions.height);
  return { x0, x1: x0 + worldW, z0, z1: z0 + worldD, y0, y1: y0 + height + legs };
}

const overlap1d = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

// Kolizje wnętrza szafki: półka lub przegroda pionowa leżąca W STREFIE SZUFLAD (baseZone
// frontów szufladowych po layoucie). Szuflady zajmują całą strefę - półka w środku oznacza,
// że korpus szuflady jej nie ominie, więc się nie zmieści ani nie wysunie. Półka dokładnie na
// granicy stref (tam, gdzie stykają się dwie grupy szuflad) jest poprawna. Zakłada aktualny
// layout (baseZone przeliczone) - wołający robi recalculateLayout / update3D.
// Zwraca listę komunikatów (po jednym na element).
export function findInteriorCollisions(mod) {
  const els = mod.elements || [];
  const zones = els
    .filter((e) => e.typ === "front" && (e.subtype === "szuflada" || e.subtype === "szuflada-wewnetrzna") && e.baseZone)
    .map((d) => ({
      arm: d.cornerArm,
      x0: num(d.baseZone.minX), x1: num(d.baseZone.maxX),
      y0: num(d.baseZone.minY) + num(d.baseZone.offsetBottom),
      y1: num(d.baseZone.maxY) - num(d.baseZone.offsetTop),
    }));
  const out = [];
  els.filter((e) => e.typ === "poziom" || e.typ === "pion").forEach((p) => {
    const px0 = num(p.x), px1 = px0 + num(p.w), py0 = num(p.y), py1 = py0 + num(p.h);
    const hit = zones.some((z) => z.arm === p.cornerArm
      && overlap1d(px0, px1, z.x0, z.x1) > 1 && overlap1d(py0, py1, z.y0, z.y1) > 1);
    if (!hit) return;
    out.push(p.typ === "poziom"
      ? `Półka na wysokości ${Math.round(py0)} mm leży w strefie szuflad - szuflady się nie zmieszczą ani nie wysuną. Przesuń półkę poza strefę szuflad albo usuń podział.`
      : `Przegroda pionowa (x ${Math.round(px0)} mm) przecina strefę szuflad - szuflady się nie zmieszczą. Usuń przegrodę albo zmień strefę szuflad.`);
  });
  return out;
}

// project: domyślnie bieżący projekt z `state`. Zwraca { issues, counts }.
// Każda uwaga: { level: 'error'|'warn'|'info', moduleId, moduleName, message }.
export function validateProject(project = state.project) {
  const issues = [];
  const add = (level, mod, message) =>
    issues.push({ level, moduleId: mod ? mod.id : null, moduleName: mod ? nameOf(mod) : "", message });

  const modules = project.modules || [];
  const room = project.room || DEFAULT_ROOM;
  const roomW = num(room.width, DEFAULT_ROOM.width);
  const roomD = num(room.depth, DEFAULT_ROOM.depth);
  const roomH = num(room.height, DEFAULT_ROOM.height);

  if (modules.length === 0) {
    add("info", null, "Projekt nie ma jeszcze żadnej szafki.");
    return finish(issues);
  }

  // Layout frontów liczymy z bieżącego `state` (jak silnik formatek).
  const prev = state.project;
  state.project = project;
  try {
    recalculateAllLayouts();
    modules.forEach((mod) => checkModule(mod));
    checkCollisions();
    checkOpenings();
    checkParts();
  } finally {
    state.project = prev;
  }
  return finish(issues);

  function checkModule(mod) {
    const d = mod.dimensions || {};
    const w = num(d.width), h = num(d.height), dep = num(d.depth);
    if (w <= 0 || h <= 0 || dep <= 0) {
      add("error", mod, "Ma zerowy lub niepoprawny wymiar (szerokość, wysokość lub głębokość).");
      return;
    }
    if (mod.type !== "corner_cabinet" && w < 100) {
      add("warn", mod, `Bardzo wąska (${Math.round(w)} mm) - sprawdź, czy to nie pomyłka w wymiarze.`);
    }

    const box = moduleBox(mod);
    if (box.x0 < -OVERLAP_TOL || box.z0 < -OVERLAP_TOL || box.x1 > roomW + OVERLAP_TOL || box.z1 > roomD + OVERLAP_TOL) {
      add("error", mod, "Wystaje poza obrys pomieszczenia.");
    }
    if (box.y1 > roomH + OVERLAP_TOL) {
      add("error", mod, `Sięga wyżej (${Math.round(box.y1)} mm) niż wysokość pomieszczenia (${Math.round(roomH)} mm).`);
    }

    findInteriorCollisions(mod).forEach((msg) => add("error", mod, msg));

    const elements = mod.elements || [];
    if (elements.length === 0) {
      add("info", mod, "Nie ma frontów ani półek (pusty korpus).");
    }

    if (mod.type !== "corner_cabinet") {
      let inner = null;
      try { inner = getCabinetInnerRect(mod); } catch (e) { inner = null; }
      elements.forEach((el) => {
        if (el.typ === "poziom") {
          const span = num(el.w);
          if (span > MAX_SHELF_SPAN) {
            add("warn", mod, `Półka szeroka na ${Math.round(span)} mm - powyżej ${MAX_SHELF_SPAN} mm będzie się uginać, rozważ przegrodę pionową.`);
          }
          if (inner && (num(el.y) < inner.minY - OVERLAP_TOL || num(el.y) + num(el.h) > inner.maxY + OVERLAP_TOL)) {
            add("error", mod, "Półka wychodzi poza wnętrze korpusu (w pionie).");
          }
          if (inner && span > inner.maxX - inner.minX + OVERLAP_TOL) {
            add("error", mod, `Półka (${Math.round(span)} mm) jest szersza niż wnętrze korpusu (${Math.round(inner.maxX - inner.minX)} mm).`);
          }
        } else if (el.typ === "front") {
          if (el.subtype === "szuflada-wewnetrzna") return;
          const fw = num(el.w), fh = num(el.h);
          if (el.w !== undefined && el.h !== undefined && (fw < MIN_FRONT_SIZE || fh < MIN_FRONT_SIZE)) {
            add("error", mod, `Front ma tylko ${Math.round(fw)} × ${Math.round(fh)} mm - zbyt mały (sprawdź podziały i szczeliny).`);
          }
          if ((el.subtype === "drzwi" || el.subtype === "drzwi-lp") && fw > MAX_DOOR_WIDTH) {
            add("warn", mod, `Drzwi szerokie na ${Math.round(fw)} mm (więcej niż ${MAX_DOOR_WIDTH} mm) - podziel na dwa skrzydła.`);
          }
        }
      });
    }
  }

  function checkCollisions() {
    const list = modules.filter((m) => m.type !== "corner_cabinet");
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = moduleBox(list[i]), b = moduleBox(list[j]);
        const ox = overlap1d(a.x0, a.x1, b.x0, b.x1);
        const oz = overlap1d(a.z0, a.z1, b.z0, b.z1);
        const oy = overlap1d(a.y0, a.y1, b.y0, b.y1);
        if (ox > OVERLAP_TOL && oz > OVERLAP_TOL && oy > STACK_TOL) {
          add("error", list[i], `Nachodzi na szafkę „${nameOf(list[j])}" (kolizja ${Math.round(ox)} × ${Math.round(oz)} mm w rzucie).`);
        }
      }
    }
  }

  // Szafka stojąca przy ścianie, która zasłania okno/drzwi/przeszkodę (nakładanie
  // w poziomie ORAZ w pionie - szafka pod parapetem albo pod oknem wiszącym jest OK).
  function checkOpenings() {
    const { walls } = computeWallLayouts(project);
    walls.forEach((wall) => {
      (wall.openings || []).forEach((op) => {
        const o0 = op.u, o1 = op.u + op.width, y0 = op.sill, y1 = op.sill + op.height;
        wall.items.forEach((it) => {
          const ou = overlap1d(it.u0, it.u1, o0, o1);
          const oy = overlap1d(it.y0, it.y1, y0, y1);
          if (ou > OVERLAP_TOL && oy > OVERLAP_TOL) {
            add(op.kind === "inne" ? "warn" : "error", it.mod,
              `Koliduje z ${openingInstrumental(op)} na ${WALL_LOCATIVE[wall.id]} (nakładanie ${Math.round(ou)} mm w poziomie, ${Math.round(oy)} mm w pionie).`);
          }
        });
      });
    });
  }

  function checkParts() {
    const parts = collectProjectParts();
    const bad = parts.filter((p) => !(num(p.length) > 0) || !(num(p.width) > 0));
    if (bad.length) {
      const names = [...new Set(bad.map((p) => p.name))].slice(0, 5).join(", ");
      add("error", null, `${bad.length} formatek ma zerowy lub niepoprawny wymiar: ${names}.`);
    }
    const cp = project.cutPlan || {};
    const sheetW = num(cp.sheetW, 2800), sheetH = num(cp.sheetH, 2070);
    const long = Math.max(sheetW, sheetH), short = Math.min(sheetW, sheetH);
    const tooBig = parts.filter((p) => p.category !== "Blat" && (Math.max(num(p.length), num(p.width)) > long || Math.min(num(p.length), num(p.width)) > short));
    if (tooBig.length) {
      const names = [...new Set(tooBig.map((p) => `${p.name} (${Math.round(num(p.length))}×${Math.round(num(p.width))})`))].slice(0, 4).join(", ");
      add("error", null, `${tooBig.length} formatek nie mieści się na arkuszu ${sheetW}×${sheetH} mm: ${names}.`);
    }
  }
}

function finish(issues) {
  const order = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);
  const counts = { error: 0, warn: 0, info: 0 };
  issues.forEach((i) => { counts[i.level]++; });
  return { issues, counts };
}
