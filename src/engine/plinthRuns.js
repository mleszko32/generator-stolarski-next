// Biegi cokołu (listwy pod szafkami dolnymi) w całym projekcie - czysta logika, bez Three.js.
// Wspólne dla listy formatek (engine/cabinet.js: collectProjectParts) i 3D (render/viewer3d.js:
// dorysowanie narożników cokołu).
import { getWorldFootprint } from "../core/layout.js";
import { sideFloorExt } from "./carcaseParts.js";
import { plinthMaterial } from "../core/plinthMaterial.js";
import { dishwasherPlinthModule } from "../core/dishwasher.js";
import { moduleBoardThickness } from "../core/boardThickness.js";

// Jak daleko (mm) koniec biegu może być od listwy prostopadłego biegu, żeby uznać to za
// narożnik do domknięcia (szafka ślepa, blenda narożna, zaślepka - cokół kończy się przed narożnikiem).
export const CORNER_REACH = 700;

const normRot = (mod) => ((parseFloat(mod.rotation) || 0) % 360 + 360) % 360;

// Pas, który zajmuje płyta cokołu w poprzek biegu (współrzędna świata: z dla biegu wzdłuż X,
// x dla biegu wzdłuż Z). Front: rot 0 -> z max, 180 -> z min, 90 -> x min, 270 -> x max.
function boardBand(rot, x, z, worldW, worldD, offset, th) {
  if (rot === 0) return [z + worldD - offset - th, z + worldD - offset];
  if (rot === 180) return [z + offset, z + offset + th];
  if (rot === 90) return [x + offset, x + offset + th];
  return [x + worldW - offset - th, x + worldW - offset];
}

// Szafka narożna L jest wyłączona z biegów - jej odcisk to L (dwa ramiona), a ta logika
// liczy prostokątne odcinki (getWorldFootprint to bounding box legA×legB).
// Zmywarka do zabudowy (core/dishwasher.js) stoi w biegu jak szafka - cokół idzie przez nią bez przerwy.
export function buildPlinthRuns(config) {
  const baseCabinets = (config.modules || []).filter(m => m.legs && m.legs.active && m.legs.plinth && m.type !== 'corner_cabinet')
    .concat((config.sidePanels || []).filter(p => p.kind === 'zmywarka').map(dishwasherPlinthModule).filter(m => m.legs.active && m.legs.plinth));

  // Tylko szafki o TEJ SAMEJ orientacji mogą stać w jednym ciągłym biegu (pod tą samą ścianą).
  // rot 0/180 - bieg wzdłuż X, 90/270 - wzdłuż Z (obrót zamienia odcisk szerokość/głębokość).
  const byRotation = new Map();
  baseCabinets.forEach(mod => {
    const rot = normRot(mod);
    if (!byRotation.has(rot)) byRotation.set(rot, []);
    byRotation.get(rot).push(mod);
  });

  const runs = [];
  byRotation.forEach((mods, rot) => {
    const alongZ = rot === 90 || rot === 270;
    mods.sort((a, b) => {
      const av = alongZ ? (parseFloat(a.position.z) || 0) : (parseFloat(a.position.x) || 0);
      const bv = alongZ ? (parseFloat(b.position.z) || 0) : (parseFloat(b.position.x) || 0);
      return av - bv;
    });

    mods.forEach(mod => {
      const x = parseFloat(mod.position.x) || 0;
      const y = parseFloat(mod.position.y) || 0;
      const z = parseFloat(mod.position.z) || 0;
      const { worldW, worldD } = getWorldFootprint(mod);
      const h = parseFloat(mod.legs.height);
      const offset = parseFloat(mod.legs.plinthOffset !== undefined ? mod.legs.plinthOffset : 40);
      const th = moduleBoardThickness(mod, config);

      // "along" = pozycja wzdłuż kierunku biegu; "runLen" = ile zajmuje; "crossPos"/"frontCoord"
      // muszą się zgadzać u sąsiada, żeby połączyć się w jeden ciągły odcinek.
      // Bok do podłogi: cokół zaczyna się / kończy na boku (grubość płyty mniej z tej strony).
      const ext = sideFloorExt(mod, config);
      const cutStart = ext.left ? th : 0, cutEnd = ext.right ? th : 0;
      const along = (alongZ ? z : x) + (alongZ ? 0 : cutStart);
      const runLen = (alongZ ? worldD : worldW) - (alongZ ? 0 : cutStart + cutEnd);
      const crossPos = alongZ ? x : z;
      const frontCoord = alongZ ? (x + worldW) : (z + worldD);

      // Szukamy wśród WSZYSTKICH biegów: szafka z innego rzędu o tym samym obrocie (np. wyspa)
      // wpadała w sortowaniu między szafki pod ścianą i rozbijała ich wspólny cokół.
      const mat = plinthMaterial(mod, config);
      const last = runs.find(r => r.rot === rot && Math.abs((r.along + r.runLen) - along) <= 1 &&
        r.crossPos === crossPos && r.h === h && r.offset === offset && r.frontCoord === frontCoord && r.mat.key === mat.key);
      if (last) {
        // styk = początek dołączanej szafki (względem początku biegu) - tu wolno ciąć
        last.joints.push(along - last.along);
        last.mods.push(mod);
        last.runLen += runLen + (along - (last.along + last.runLen));
      } else {
        runs.push({
          rot, along, runLen, crossPos, y, h, offset, frontCoord, th, joints: [], mat, mods: [mod],
          axis: alongZ ? 'z' : 'x', band: boardBand(rot, x, z, worldW, worldD, offset, th),
        });
      }
    });
  });

  closePlinthCorners(runs);
  return runs;
}

const dist = (v, [lo, hi]) => (v < lo ? lo - v : v > hi ? v - hi : 0);

// Domykanie wewnętrznych narożników: dwa biegi z prostopadłych ścian, których końce dochodzą
// (do CORNER_REACH) do listwy drugiego biegu. Łączenie na styk: bieg wzdłuż X przechodzi przez
// narożnik do zewnętrznej krawędzi listwy biegu wzdłuż Z, a ten zaczyna się / kończy na licu
// listwy biegu X. Zmienia along/runLen/joints biegów i zapisuje dołożone kawałki w run.cornerFills
// (świat: x0..x1, z0..z1 - dla 3D). Kawałek może być też ujemny (bieg przycięty) - wtedy bez wypełnienia.
export function closePlinthCorners(runs) {
  runs.forEach(r => { r.cornerFills = r.cornerFills || []; r.cornerEnds = r.cornerEnds || {}; });
  const xs = runs.filter(r => r.axis === 'x');
  const zs = runs.filter(r => r.axis === 'z');
  xs.forEach(px => {
    zs.forEach(qz => {
      if (Math.abs(px.y - qz.y) > 1 || Math.abs(px.h - qz.h) > 1) return;
      const p0 = px.along, p1 = px.along + px.runLen;
      const q0 = qz.along, q1 = qz.along + qz.runLen;
      // który koniec biegu X leży przy listwie biegu Z (i odwrotnie)
      const pEnd = dist(p1, qz.band) <= dist(p0, qz.band) ? 'end' : 'start';
      const qEnd = dist(q1, px.band) <= dist(q0, px.band) ? 'end' : 'start';
      const pv = pEnd === 'end' ? p1 : p0;
      const qv = qEnd === 'end' ? q1 : q0;
      if (dist(pv, qz.band) > CORNER_REACH || dist(qv, px.band) > CORNER_REACH) return;
      // listwa drugiego biegu musi leżeć PRZY końcu, a nie w środku biegu
      const pMid = (p0 + p1) / 2, qMid = (q0 + q1) / 2;
      const qBandMid = (qz.band[0] + qz.band[1]) / 2, pBandMid = (px.band[0] + px.band[1]) / 2;
      if ((pEnd === 'end') !== (qBandMid > pMid) || (qEnd === 'end') !== (pBandMid > qMid)) return;
      if (px.cornerEnds[pEnd] || qz.cornerEnds[qEnd]) return;
      px.cornerEnds[pEnd] = qz; qz.cornerEnds[qEnd] = px;

      // bieg X: do zewnętrznej krawędzi listwy Z
      const pNew = pEnd === 'end' ? qz.band[1] : qz.band[0];
      // bieg Z: do lica listwy X od swojej strony
      const qNew = qEnd === 'end' ? px.band[0] : px.band[1];
      setEnd(px, pEnd, pNew, (a, b) => ({ x0: a, x1: b, z0: px.band[0], z1: px.band[1] }));
      setEnd(qz, qEnd, qNew, (a, b) => ({ x0: qz.band[0], x1: qz.band[1], z0: a, z1: b }));
    });
  });
  return runs;
}

function setEnd(run, which, value, rect) {
  const a0 = run.along, a1 = run.along + run.runLen;
  if (which === 'end') {
    if (value > a1) run.cornerFills.push(rect(a1, value));
    run.runLen = value - a0;
  } else {
    if (value < a0) run.cornerFills.push(rect(value, a0));
    const d = a0 - value;
    run.along = value;
    run.runLen += d;
    run.joints = run.joints.map(j => j + d);
  }
  run.joints = run.joints.filter(j => j > 0 && j < run.runLen);
}
