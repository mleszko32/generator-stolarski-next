// src/core/cornerChecks.js
//
// Kontrole zabudowy narożnej do core/validate.js (czysta logika, z testami):
//  - cornerFrontIssues: front szafki przy narożniku a lico frontów szafek z sąsiedniej
//    (prostopadłej) ściany - drzwi/szuflada zachodzi za sąsiedni front (nie otworzy się)
//    albo zostaje za mało miejsca na uchwyt (za wąska blenda narożna),
//  - footprintBoxes: odciski szafek do wykrywania kolizji, szafka narożna L jako DWA
//    prostokąty ramion zamiast jednego kwadratu legA×legB,
//  - passageIssues: przejście między ciągami szafek dolnych na przeciwległych ścianach.
// Zakłada przeliczony layout (validate.js woła recalculateAllLayouts).
import { computeWallLayouts } from "./walls.js";
import { getWorldFootprint, getCornerDepths } from "./layout.js";
import { worldToWall, wallToWorld, FRONT_ALLOWANCE } from "./wallFill.js";
import { num } from "../utils/math.js";

export const MIN_CORNER_GAP = 30;   // mm między krawędzią frontu a licem frontu prostopadłego (fronty bez uchwytów)
export const REC_CORNER_GAP = 50;   // zalecane przy zwykłych uchwytach
export const MIN_PASSAGE = 1200;
export const MIN_PASSAGE_HARD = 1067;
const NEAR = 150;                    // sąsiad "przy narożniku": nie dalej niż tyle za licem frontu
const BASE_TOP = 1000;               // szafki sięgające nie wyżej niż tyle nad podłogą = dolny ciąg

// Sąsiednie ściany w kolejności zgodnej z zegarem: koniec ściany (u = długość) styka się
// z początkiem następnej (u = 0) - patrz core/walls.js.
const NEXT = { tyl: "prawa", prawa: "przednia", przednia: "lewa", lewa: "tyl" };
const PREV = { prawa: "tyl", przednia: "prawa", lewa: "przednia", tyl: "lewa" };
const OPPOSITE = [["tyl", "przednia"], ["lewa", "prawa"]];

function moduleBox(mod) {
  const { worldW, worldD } = getWorldFootprint(mod);
  const x0 = num(mod.position && mod.position.x), z0 = num(mod.position && mod.position.z);
  return { x0, x1: x0 + worldW, z0, z1: z0 + worldD };
}

const overlap1d = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
const nameOf = (mod) => (mod.name || "").trim() || "Szafka bez nazwy";

export function cornerFrontIssues(project) {
  const { room, walls } = computeWallLayouts(project);
  const byId = Object.fromEntries(walls.map((w) => [w.id, w]));
  const issues = [];
  walls.forEach((wx) => {
    [["start", PREV[wx.id]], ["end", NEXT[wx.id]]].forEach(([end, yId]) => {
      const wy = byId[yId];
      wx.items.filter((it) => it.kind === "cabinet").forEach((it) => {
        const fronts = it.fronts.filter((f) => f.subtype !== "zaslepka" && f.u1 - f.u0 > 1);
        if (!fronts.length) return;
        // a = od lica ściany Y do najbliższej krawędzi frontu szafki X.
        const a = end === "start" ? Math.min(...fronts.map((f) => f.u0)) : wx.length - Math.max(...fronts.map((f) => f.u1));
        const dx = worldToWall(wx.id, room, moduleBox(it.mod)).d1;
        wy.items.forEach((jt) => {
          if (jt.kind !== "cabinet" || jt.mod === it.mod) return;
          if (overlap1d(it.y0, it.y1, jt.y0, jt.y1) <= 1) return;
          // b0 = od lica ściany X do bliższego boku szafki Y.
          const b0 = end === "start" ? wy.length - jt.u1 : jt.u0;
          if (b0 > dx + FRONT_ALLOWANCE + NEAR) return;
          const dy = worldToWall(wy.id, room, moduleBox(jt.mod)).d1;
          const plane = dy + FRONT_ALLOWANCE; // lico frontów szafki Y od ściany Y
          if (a > plane + REC_CORNER_GAP + NEAR) return;
          const gap = Math.round(a - plane);
          if (a < plane - 1) {
            issues.push({ level: "error", mod: it.mod, message: `Front przy narożniku zachodzi ${-gap} mm za lico frontów szafki „${nameOf(jt.mod)}” z sąsiedniej ściany - nie otworzy się. Odsuń szafkę albo dodaj blendę narożną (ok. ${REC_CORNER_GAP} mm).` });
          } else if (gap < MIN_CORNER_GAP) {
            issues.push({ level: "warn", mod: it.mod, message: `Przy narożniku zostaje tylko ${gap} mm między frontem a licem frontów szafki „${nameOf(jt.mod)}” - uchwyt i drzwi uderzą w sąsiedni front. Blenda narożna: ${MIN_CORNER_GAP} mm bez uchwytów, ${REC_CORNER_GAP} mm z uchwytami.` });
          }
        });
      });
    });
  });
  return issues;
}

// [{ mod, x0, x1, z0, z1, y0, y1 }] - szafka narożna L jako dwa ramiona.
export function footprintBoxes(project) {
  const { room, walls } = computeWallLayouts(project);
  const out = [];
  (project.modules || []).forEach((mod) => {
    const y0 = num(mod.position && mod.position.y);
    const legs = mod.legs && mod.legs.active ? num(mod.legs.height) : 0;
    const y1 = y0 + legs + num(mod.dimensions && mod.dimensions.height);
    if (mod.type !== "corner_cabinet") {
      out.push({ mod, ...moduleBox(mod), y0, y1 });
      return;
    }
    const { depthA, depthB } = getCornerDepths(mod);
    walls.forEach((w) => w.items.filter((it) => it.mod === mod && it.kind === "corner").forEach((it) => {
      const b = wallToWorld(w.id, room, it.u0, it.u1 - it.u0, 0, it.arm === "A" ? depthA : depthB);
      out.push({ mod, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y0, y1 });
    }));
  });
  return out;
}

// Ciągi szafek dolnych naprzeciw siebie: przejście między licami frontów.
export function passageIssues(project) {
  const { room, walls } = computeWallLayouts(project);
  const byId = Object.fromEntries(walls.map((w) => [w.id, w]));
  const issues = [];
  OPPOSITE.forEach(([a, b]) => {
    const wa = byId[a], wb = byId[b];
    const span = a === "tyl" ? room.depth : room.width;
    const base = (w) => w.items.filter((it) => it.y1 <= BASE_TOP && it.y1 - it.floorY > 300);
    let worst = null;
    base(wa).forEach((ia) => base(wb).forEach((ib) => {
      // u na przeciwległej ścianie biegnie odwrotnie: [L - u1, L - u0].
      if (overlap1d(ia.u0, ia.u1, wb.length - ib.u1, wb.length - ib.u0) <= 1) return;
      const da = worldToWall(a, room, moduleBox(ia.mod)).d1 + FRONT_ALLOWANCE;
      const db = worldToWall(b, room, moduleBox(ib.mod)).d1 + FRONT_ALLOWANCE;
      const passage = span - da - db;
      if (!worst || passage < worst.passage) worst = { passage, mod: ia.mod };
    }));
    if (!worst || worst.passage >= MIN_PASSAGE) return;
    const p = Math.round(worst.passage);
    issues.push(worst.passage < MIN_PASSAGE_HARD
      ? { level: "error", mod: null, message: `Przejście między szafkami na przeciwległych ścianach ma tylko ${p} mm - za mało do pracy w kuchni (minimum ok. ${MIN_PASSAGE_HARD} mm).` }
      : { level: "warn", mod: null, message: `Przejście między szafkami na przeciwległych ścianach ma ${p} mm - ciasno, zalecane co najmniej ${MIN_PASSAGE} mm.` });
  });
  return issues;
}
