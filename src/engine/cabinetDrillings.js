// src/engine/cabinetDrillings.js
//
// Formatki korpusu zwykłej szafki (dolna, wisząca, słupek) z otworami - dane do instrukcji
// montażu szafki (ui/cabinetInstructions.js, rysunki render/cabinetDrawing2d.js), w tym samym
// układzie co instrukcja skrzynki szuflady (core/drawerBoxBuild.js). Czysta logika bez DOM.
//
// Otwory biorą się z tych samych danych co rysunek boku z wierceniami (render/viewer2d.js:
// drawSideDetails): mountingData z engine/cabinet.js (łączniki korpusu, prowadnice, zawiasy,
// mocowanie przegród) + półki z mod.elements (stałe: wkręt + kołek 37/69 mm od krawędzi,
// ruchome: podpórki 37 mm od przodu i tyłu, 3 otwory co 32 mm, środek 2,5 mm pod półką).
// Pozycje są więc identyczne jak na rysunku 2D - tu tylko zebrane per formatka, z otworami
// po stronie łączonej formatki (czoła wieńców, półek, przegród).
//
// Układ współrzędnych jak w skrzynkach szuflad:
// - formatka pionowa (bok, przegroda): widok płaszczyzny, x od przodu (0), y od dołu formatki;
// - formatka pozioma (wieniec, półka, trawers poziomy): rzut z góry, x od lewej krawędzi
//   formatki, z od przodu; otwory w czołach mają edge 'lewe' / 'prawe' / 'przednie' / 'tylne'.
import { calculateModuleParts } from "./cabinet.js";
import { recalculateLayout, getTraverseConfig } from "../core/layout.js";
import { jointSetsFor } from "./carcaseParts.js";
import { num, round1 } from "../utils/math.js";
import { getBlindStile, blindGeometry, getBlindCorner, PARALLEL_PLATE_INSET } from "../core/blindCorner.js";

const SHELF_PIN_DROP = 2.5;
const EPS = 2;

// Średnice i głębokości (jak legenda rysunku 2D: kołek Ø8 + wkręt, podpórki / prowadnice /
// prowadniki zawiasów Ø5). Głębokości wkrętu/kołka jak w skrzynkach szuflad (poradniki).
export function cabinetHoleSpecs(th) {
  const faceDowel = Math.min(12, Math.max(8, th - 5));
  return {
    wkret: { face: { d: 4.5, depth: null, note: "przelot + pogłębienie" }, edge: { d: 3, depth: round1(50 - th + 2) }, label: "wkręt 4×50" },
    kolek: { face: { d: 8, depth: faceDowel }, edge: { d: 8, depth: round1(30 - faceDowel + 1) }, label: "kołek 8×30" },
    podporka: { face: { d: 5, depth: 12 }, label: "podpórka półki Ø5" },
    prowadnica: { face: { d: 5, depth: 12 }, label: "wkręt prowadnicy szuflady" },
    zawias: { face: { d: 5, depth: 12 }, label: "prowadnik zawiasu" },
  };
}

const HOLE_KIND = { screw: "wkret", dowel: "kolek" };

// Formatki korpusu z otworami: [{ id, kind: 'bok'|'przegroda'|'poziom'|'trawers-pion'|'plecy'|'polka',
// name, qty, length, width, thickness, holes[], note? }]. Szafka narożna i pod skos - [] (inna
// geometria, mają własne rysunki).
export function getCabinetPanels(mod, project) {
  if (!mod || mod.type === "corner_cabinet" || mod.type === "slope_cabinet") return [];
  recalculateLayout(mod);
  const th = num(project.materials && project.materials.boardThickness, 18) || 18;
  const backThick = num(project.materials && project.materials.backThickness, 3) || 3;
  const W = num(mod.dimensions.width), H = num(mod.dimensions.height), D = num(mod.dimensions.depth);
  const cons = { joinType: "boki_przelotowe", topType: "pelny", traverseWidth: 100, ...(project.construction || {}), ...(mod.construction || {}) };
  const isFull = cons.joinType === "wience_przelotowe";       // wieńce na całą szerokość, boki między nimi
  const backP = { type: "nakladane", offset: 16, ...(project.backPanel || {}), ...(mod.backPanel || {}) };
  const sideH = isFull ? H - 2 * th : H;
  const sideD = backP.type === "nut" ? D : D - backThick;
  const tbDepth = backP.type === "nut" ? D - num(backP.offset, 16) - backThick : D - backThick;
  const tbW = isFull ? W : W - 2 * th;
  const spec = cabinetHoleSpecs(th);
  const setsToKinds = (depth) => jointSetsFor(mod, project, depth).flatMap((s) => [[s.screw, "wkret"], [s.dowel, "kolek"]]).sort((a, b) => a[0] - b[0]);
  const { mountingData, parts } = calculateModuleParts(mod);
  const calcY = (y) => (isFull ? y - th : y);             // y w układzie modułu -> od dołu boku
  const els = mod.elements || [];
  const fronts = els.filter((e) => e.typ === "front");
  const frontOf = (id) => fronts.find((f) => f.id === id);
  const zoneMinX = (f) => (f && f.baseZone ? num(f.baseZone.minX, th) : th);
  const zoneMaxX = (f) => (f && f.baseZone ? num(f.baseZone.maxX, W - th) : W - th);
  const face = (kind) => spec[kind].face;
  const edge = (kind) => spec[kind].edge;

  // Otwory ściany pionowej, do której przylega płaszczyzna o współrzędnej faceX (lewa ściana
  // wnęki = prawa strona panelu: rightFace; prawa ściana wnęki = lewa strona panelu).
  const verticalFaceHoles = (faceX, rightFace, y0, h) => {
    const holes = [];
    const inPanel = (y) => y >= y0 - 5 && y <= y0 + h + 5;
    const touches = (x) => Math.abs(x - faceX) < EPS;
    // Półki: stałe (wkręt + kołek), ruchome (podpórki).
    els.filter((el) => el.typ === "poziom" && (rightFace ? touches(el.x) : touches(el.x + el.w))).forEach((el) => {
      const cy = calcY(el.y);
      if (!inPanel(cy)) return;
      if (el.isStructural) {
        jointSetsFor(mod, project, tbDepth).forEach((set) => {
          const y = round1(cy + el.h / 2 - y0);
          holes.push({ x: set.screw, y, kind: "wkret", ...face("wkret"), to: "półka stała" });
          holes.push({ x: set.dowel, y, kind: "kolek", ...face("kolek"), to: "półka stała" });
        });
      } else {
        [37, sideD - 37].forEach((hx) => [-32, 0, 32].forEach((dy) => {
          holes.push({ x: hx, y: round1(cy - SHELF_PIN_DROP + dy - y0), kind: "podporka", ...face("podporka"), to: "półka ruchoma", center: dy === 0 });
        }));
      }
    });
    // Prowadnice szuflad, których wnęka przylega do tej ściany.
    mountingData.filter((d) => d.type === "drawer" && d.slideSideHoles && d.slideSideHoles.length).forEach((d) => {
      const f = frontOf(d.frontId);
      if (!(rightFace ? touches(zoneMinX(f)) : touches(zoneMaxX(f)))) return;
      const cy = calcY(d.slideSideHoles[0].y);
      if (!inPanel(cy)) return;
      d.slideSideHoles.forEach((hole) => holes.push({ x: round1(hole.x), y: round1(cy - y0), kind: "prowadnica", ...face("prowadnica"), to: "prowadnica szuflady" }));
    });
    // Zawiasy drzwi zawieszonych na tej ścianie (prowadnik: 2 otwory, 37 mm od przodu, ±16 mm).
    // Drzwi szafki ślepej na listwie / zaślepce (parallelMount) mają prowadniki tam, nie na boku.
    mountingData.filter((d) => d.type === "door" && !d.parallelMount).forEach((d) => {
      const f = frontOf(d.frontId);
      const ok = rightFace ? d.side === "left" && touches(zoneMinX(f)) : d.side === "right" && touches(zoneMaxX(f));
      if (!ok) return;
      (d.hinges || []).filter((hg) => hg.isLocal !== false).forEach((hg) => {
        const cy = calcY(hg.y);
        if (!inPanel(cy)) return;
        [-16, 16].forEach((dy) => holes.push({ x: 37, y: round1(cy + dy - y0), kind: "zawias", ...face("zawias"), to: "prowadnik zawiasu", hingeY: round1(cy - y0) }));
      });
    });
    return holes;
  };

  // Łączniki korpusu (wieńce / trawersy) na bokach - z getCorpusHoles (mountingData 'corpus').
  const corpus = (mountingData.find((d) => d.type === "corpus") || { holes: [] }).holes;
  const corpusOnSide = isFull ? [] : corpus.map((h) => ({ x: round1(h.xFromFront), y: round1(calcY(h.y)), kind: HOLE_KIND[h.holeType], ...face(HOLE_KIND[h.holeType]), to: h.y < H / 2 ? "wieniec dolny" : "wieniec / trawers górny" }));

  // Wieńce przelotowe: boki stoją między wieńcami, łączniki wchodzą w ich czoła dolne i górne.
  const fullJointsSide = setsToKinds(tbDepth);
  const topJointsSide = cons.topType === "pelny" ? fullJointsSide
    : cons.topType === "trawersy_poziom" ? fullJointsSide.filter(([z]) => (z < D / 2 ? getTraverseConfig(cons).front.active : getTraverseConfig(cons).rear.active))
    : [];
  const sideEdgeHoles = isFull ? [
    ...fullJointsSide.map(([z, kind]) => ({ edge: "dolne", x: round1(z), y: 0, kind, ...edge(kind), to: "wieniec dolny" })),
    ...topJointsSide.map(([z, kind]) => ({ edge: "gorne", x: round1(z), y: round1(sideH), kind, ...edge(kind), to: "wieniec / trawers górny" })),
  ] : [];

  // Szafka ślepa: listwa między wieńcami (core/blindCorner.js: getBlindStile).
  const stile = getBlindStile(mod, project);
  const stileJoints = stile ? [[25, "kolek"], [stile.w / 2, "wkret"], [stile.w - 25, "kolek"]] : [];
  const stileWieniecHoles = stile ? stileJoints.map(([sx, kind]) => ({
    edge: "lico", x: round1(stile.x + sx - (isFull ? 0 : th)), z: round1(tbDepth - th / 2), kind, ...face(kind), to: "listwa szafki ślepej",
  })) : [];

  const panels = [];
  // --- Boki ---
  panels.push({ id: "bok-lewy", kind: "bok", name: "Bok lewy", qty: 1, length: sideD, width: sideH, thickness: th, frontOnRight: false,
    holes: [...corpusOnSide, ...sideEdgeHoles, ...verticalFaceHoles(th, true, 0, sideH)] });
  panels.push({ id: "bok-prawy", kind: "bok", name: "Bok prawy", qty: 1, length: sideD, width: sideH, thickness: th, frontOnRight: true,
    holes: [...corpusOnSide, ...sideEdgeHoles, ...verticalFaceHoles(W - th, false, 0, sideH)] });

  // --- Przegrody (obie strony + łączniki w czołach górnym i dolnym, jeśli stała) ---
  els.filter((e) => e.typ === "pion").sort((a, b) => a.x - b.x).forEach((p, i) => {
    const y0 = calcY(p.y);
    const left = verticalFaceHoles(p.x, false, y0, p.h).map((h) => ({ ...h, side: "lewa" }));
    const right = verticalFaceHoles(p.x + p.w, true, y0, p.h).map((h) => ({ ...h, side: "prawa" }));
    const edgeHoles = p.isStructural ? ["dolne", "gorne"].flatMap((ed) => setsToKinds(tbDepth).map(([z, kind]) => ({
      edge: ed, x: round1(z), y: ed === "dolne" ? 0 : round1(p.h), kind, ...edge(kind), to: ed === "dolne" ? "wieniec / półka pod" : "wieniec / półka nad",
    }))) : [];
    panels.push({ id: `przegroda-${i + 1}`, kind: "przegroda", name: `Przegroda ${i + 1}`, qty: 1, length: round1(tbDepth), width: round1(p.h), thickness: th, holes: [...left, ...right, ...edgeHoles] });
  });

  // --- Formatki poziome: wieniec dolny, górny (albo trawersy), półki ---
  const pionMount = mountingData.filter((d) => d.type === "wieniec-mount");
  const pionHolesFor = (key) => (pionMount.find((m) => m.panelKey === key) || { holes: [] }).holes.map((h) => ({
    edge: "lico", x: round1(h.x), z: round1(tbDepth - h.zFromFront), kind: HOLE_KIND[h.holeType], ...face(HOLE_KIND[h.holeType]), to: "przegroda",
  }));
  // Łączniki z bokami: w czołach (boki przelotowe) albo w licu wieńca (wieńce przelotowe).
  const sideJoints = (zs) => {
    if (isFull) {
      return [round1(th / 2), round1(W - th / 2)].flatMap((x) => zs.map(([z, kind]) => ({ edge: "lico", x, z: round1(z), kind, ...face(kind), to: x < W / 2 ? "bok lewy" : "bok prawy" })));
    }
    return ["lewe", "prawe"].flatMap((ed) => zs.map(([z, kind]) => ({ edge: ed, x: ed === "lewe" ? 0 : round1(tbW), z: round1(z), kind, ...edge(kind), to: ed === "lewe" ? "bok lewy" : "bok prawy" })));
  };
  const fullJoints = setsToKinds(tbDepth);
  panels.push({ id: "wieniec-dolny", kind: "poziom", name: "Wieniec dolny", qty: 1, length: round1(tbW), width: round1(tbDepth), thickness: th,
    holes: [...sideJoints(fullJoints), ...pionHolesFor("wieniec-dolny"), ...stileWieniecHoles] });
  const trav = getTraverseConfig(cons);
  if (cons.topType === "pelny") {
    panels.push({ id: "wieniec-gorny", kind: "poziom", name: "Wieniec górny", qty: 1, length: round1(tbW), width: round1(tbDepth), thickness: th,
      holes: [...sideJoints(fullJoints), ...pionHolesFor("wieniec-gorny"), ...stileWieniecHoles] });
  } else if (cons.topType === "trawersy_poziom") {
    [["front", "Trawers przedni (poziomy)", 0, [[37, "wkret"], [69, "kolek"]]], ["rear", "Trawers tylny (poziomy)", null, [[tbDepth - 69, "kolek"], [tbDepth - 37, "wkret"]]]].forEach(([key, name, z0, zs]) => {
      if (!trav[key].active) return;
      const tw = num(trav[key].width, 100);
      const start = z0 === null ? tbDepth - tw : 0;
      panels.push({ id: `trawers-${key}`, kind: "poziom", name, qty: 1, length: round1(tbW), width: round1(tw), thickness: th,
        holes: sideJoints(zs.map(([z, k]) => [z - start, k])) });
    });
  } else if (cons.topType === "trawersy_pion") {
    [["front", "Trawers przedni (pionowy)"], ["rear", "Trawers tylny (pionowy)"]].forEach(([key, name]) => {
      if (!trav[key].active) return;
      const tw = num(trav[key].width, 100);
      panels.push({ id: `trawers-${key}`, kind: "trawers-pion", name, qty: 1, length: round1(tbW), width: round1(tw), thickness: th,
        holes: ["lewe", "prawe"].flatMap((ed) => [[37, "wkret"], [69, "kolek"]].map(([fromTop, kind]) => ({
          edge: ed, x: ed === "lewe" ? 0 : round1(tbW), y: round1(tw - fromTop), kind, ...edge(kind), to: ed === "lewe" ? "bok lewy" : "bok prawy",
        }))) });
    });
  }
  // Półki stałe: łączniki w czołach przy ścianach, do których przylegają; ruchome - bez otworów.
  els.filter((e) => e.typ === "poziom").sort((a, b) => a.y - b.y).forEach((s, i) => {
    const holes = [];
    if (s.isStructural) {
      const atLeft = Math.abs(s.x - th) < EPS || els.some((p) => p.typ === "pion" && Math.abs(p.x + p.w - s.x) < EPS);
      const atRight = Math.abs(s.x + s.w - (W - th)) < EPS || els.some((p) => p.typ === "pion" && Math.abs(p.x - (s.x + s.w)) < EPS);
      [["lewe", atLeft, 0], ["prawe", atRight, round1(s.w)]].forEach(([ed, on, x]) => {
        if (!on) return;
        fullJoints.forEach(([z, kind]) => holes.push({ edge: ed, x, z: round1(z), kind, ...edge(kind), to: ed === "lewe" ? "ściana z lewej" : "ściana z prawej" }));
      });
      holes.push(...pionHolesFor(`polka-${s.id}-gora`), ...pionHolesFor(`polka-${s.id}-dol`));
    }
    panels.push({ id: `polka-${i + 1}`, kind: "polka", name: s.isStructural ? `Półka stała ${i + 1}` : `Półka ruchoma ${i + 1}`, qty: 1,
      length: round1(s.w), width: round1(s.isStructural ? tbDepth : tbDepth - 5), thickness: th, structural: !!s.isStructural, y: round1(s.y), x: round1(s.x), holes });
  });

  // --- Listwa szafki ślepej: łączniki w czołach (do wieńców) + prowadniki zawiasów
  // równoległych na tylnej płaszczyźnie, 21,5 mm od krawędzi po stronie drzwi (PARALLEL_PLATE_INSET).
  // x liczone w widoku od frontu (od lewej krawędzi listwy), y od dołu listwy. ---
  if (stile) {
    const g = blindGeometry(mod, project);
    const plateX = g.side === "left" ? round1(stile.w - PARALLEL_PLATE_INSET) : PARALLEL_PLATE_INSET;
    const hingeHoles = mountingData.filter((d) => d.type === "door" && d.parallelMount === "listwa").flatMap((d) =>
      (d.hinges || []).filter((hg) => hg.isLocal !== false).flatMap((hg) => [-16, 16].map((dy) => ({
        x: plateX, y: round1(hg.y - stile.y + dy), kind: "zawias", ...face("zawias"), to: "prowadnik zawiasu równoległego (tył listwy)", hingeY: round1(hg.y - stile.y),
      }))));
    panels.push({ id: "listwa-slepa", kind: "przegroda", name: "Listwa szafki ślepej", qty: 1, length: stile.w, width: stile.h, thickness: th,
      holes: [
        ...["dolne", "gorne"].flatMap((ed) => stileJoints.map(([sx, kind]) => ({ edge: ed, x: round1(sx), y: ed === "dolne" ? 0 : stile.h, kind, ...edge(kind), to: ed === "dolne" ? "wieniec dolny" : "wieniec / trawers górny" }))),
        ...hingeHoles,
      ],
      note: `między wieńcami, lico równo z czołem korpusu; prowadniki zawiasów na tylnej płaszczyźnie (${PARALLEL_PLATE_INSET} mm od krawędzi przy drzwiach, płytka 3 mm); zaślepkę przykręcić od środka przez listwę` });
  }

  // --- Plecy (bez otworów; sposób montażu w uwadze) ---
  const back = parts.find((p) => p.category === "Plecy");
  if (back) panels.push({ id: "plecy", kind: "plecy", name: "Plecy (HDF)", qty: 1, length: back.length, width: back.width, thickness: backThick, holes: [],
    note: backP.type === "nut" ? `w nucie (głęb. ${num(backP.grooveDepth, 6)} mm, ${num(backP.offset, 16)} mm od tyłu) - wsunąć przed zamknięciem korpusu` : "nakładane - przybić / przykręcić od tyłu po złożeniu korpusu" });

  return panels;
}

// Opis konstrukcji do nagłówka instrukcji i kolejności montażu.
export function getCabinetConstruction(mod, project) {
  const cons = { joinType: "boki_przelotowe", topType: "pelny", ...(project.construction || {}), ...(mod.construction || {}) };
  const backP = { type: "nakladane", ...(project.backPanel || {}), ...(mod.backPanel || {}) };
  return {
    isFull: cons.joinType === "wience_przelotowe",
    topType: cons.topType,
    backType: backP.type,
    legs: !!(mod.legs && mod.legs.active),
    legsHeight: mod.legs && mod.legs.active ? num(mod.legs.height, 100) : 0,
    plinth: !!(mod.legs && mod.legs.active && mod.legs.plinth),
    drawers: (mod.elements || []).filter((e) => e.typ === "front" && (e.subtype || "").includes("szuflada")).length,
    doors: (mod.elements || []).filter((e) => e.typ === "front" && (e.subtype || "").includes("drzwi")).length,
    blindMount: (getBlindCorner(mod) || {}).mount || null,
    movableShelves: (mod.elements || []).filter((e) => e.typ === "poziom" && !e.isStructural).length,
  };
}
