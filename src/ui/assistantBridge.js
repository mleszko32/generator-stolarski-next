// src/ui/assistantBridge.js
//
// Wystawia „pilota” z core/assistantApi.js jako `window.gsn`, żeby Claude (Claude Code
// przez podgląd przeglądarki albo Claude w Chrome) zmieniał projekt nazwanymi poleceniami.
// Każda zmiana przechodzi przez standardowe odświeżenie, więc działa Ctrl+Z i autozapis.
// Instrukcja dla Claude'a: .claude/skills/pilot-aplikacji/SKILL.md.
import { state, addModule, deleteModule, duplicateModule } from "../core/state.js";
import * as api from "../core/assistantApi.js";
import { alignSelection, pushSelection, packSelection } from "../core/alignCommands.js";
import { getModuleSummary } from "../core/moduleInfo.js";
import { calculateModuleParts } from "../engine/cabinet.js";
import { undo, redo } from "../core/history.js";
import { getSavedProjectsList, loadProjectFromCloud, saveProjectToCloud, hasUnsavedChanges } from "../core/storage.js";
import { update3D, updateRoom } from "../render/viewer3d.js";
import { updateSidebar } from "./sidebar.js";
import { initPropertiesPanel } from "./properties.js";

const HELP = `Pilot aplikacji (window.gsn). Szafkę wskazujesz id, nazwą albo jednoznacznym fragmentem nazwy.
Wnęki: ścieżka "" = całe wnętrze, potem a/b (półka: a = dół, b = góra; przegroda: a = lewa, b = prawa).
Współrzędne wnętrza w mm od lewego dolnego narożnika korpusu.

PROJEKT W CHMURZE (async — await; wymaga zalogowania)
  projects()                    lista zapisanych projektów
  open(nazwa, {force})          wczytaj projekt (przy niezapisanych zmianach tylko z force: true)
  save(nazwa?)                  zapisz wczytany projekt; z nazwą — pierwszy zapis nowego (nie nadpisuje innych)
  Nowy pusty projekt = przeładowanie strony (bez wczytywania).
CZYTANIE
  overview()                    spis szafek: wymiary, położenie, półki, fronty
  module(szafka)                pełne dane szafki (JSON)
  info(szafka)                  podsumowanie: korpus, wnętrze, drzwi z zawiasami, szuflady
  zones(szafka)                 lista wnęk ze ścieżkami, dzielnikami i frontami
  parts(szafka)                 formatki szafki
  check()                       błędy i ostrzeżenia kontroli projektu
ZMIANY (każda odświeża aplikację; cofnięcie: undo())
  select(szafka)                zaznacz szafkę
  set(szafka, zmiana)           np. set("Słupek", { dimensions: { height: 2100 }, position: { x: 1200 } })
  split(szafka, wnęka, "h"|"v", poz?)   półka / przegroda (poz = y spodu półki / x przegrody)
  shelves(szafka, wnęka, ile)   równe półki ruchome w pustej wnęce
  front(szafka, wnęka, rodzaj, opcje?)  rodzaj: drzwi | drzwi-lp | szuflada | szuflada-wewnetrzna
                                opcje: { openingSide: "left"|"right", distribution: "3" | "1:1:2" }
  clearFronts(szafka, wnęka)    zdejmij fronty z wnęki
  moveDivider(szafka, wnęka, poz)       przesuń dzielnik wnęki
  structural(szafka, wnęka, tak/nie)    półka stała / ruchoma
  removeDivider(szafka, wnęka)  usuń dzielnik (scala wnękę)
  add(typ)                      nowa szafka: base_cabinet | upper_cabinet | tall_cabinet
  duplicate(szafka) / remove(szafka)
  splitPoints(szafka)           gdzie można podzielić szafkę na korpusy (półki / przegrody na całe wnętrze) + fronty na cięciu
  splitCabinet(szafka, opcje)   podziel na dwa korpusy: { axis: "h"|"v", at: mm } albo { dividerId };
                                fronty na cięciu: straddle "both" | "first" | "second" (dół/lewy, góra/prawy), fronts: { idFrontu: ... }
  panel(rodzaj, pola)           nowy bok / blenda / panel poziomy / zmywarka: rodzaj bok | blenda | poziomy | zmywarka
                                zmywarka: dimensions { width: 450 | 600, height: podłoga→spód blatu, depth }, topBoard, decor, materialId
                                panel poziomy: dimensions { width: długość X, depth: głębokość Z, height: grubość },
                                position { x, z, y: spód płyty }, decor; np. panel("poziomy", { name: "Półka",
                                dimensions: { width: 2102, depth: 300 }, position: { x: 1688, y: 819, z: 0 } })
  setPanel(nazwa, zmiana) / removePanel(nazwa)
  align([szafki], krawędź)      zrównaj z pierwszą szafką: left | right | back | front | top | bottom
  push(szafka | [szafki], kier) dosuń do sąsiada / ściany: left | right | back | front (strony jak od frontu szafki)
  pack([szafki])                zsuń w rząd bez przerw (pierwsza zostaje na miejscu)
  undo() / redo()               szybka seria poleceń to jeden krok historii`;

function refresh() {
  initPropertiesPanel();
  updateSidebar();
  update3D();
}

// Zmiana + odświeżenie; zwraca krótki wynik do sprawdzenia, co wyszło.
const change = (fn) => (...args) => {
  const out = fn(...args);
  refresh();
  return out;
};

const mod = (ref) => api.findModule(ref);
const zonesOf = (ref) => api.listZones(mod(ref));
// Zaznaczenie do poleceń ruchu: lista szafek, pierwsza jest odniesieniem.
const moveSel = (refs) => {
  const mods = (Array.isArray(refs) ? refs : [refs]).map(mod);
  return { sel: { moduleIds: new Set(mods.map((m) => m.id)), panelIds: new Set() }, refId: mods[0].id, mods };
};
const positions = (mods) => mods.map((m) => ({ name: m.name, ...m.position }));

export function initAssistantBridge() {
  window.gsn = {
    help: () => HELP,
    projects: () => getSavedProjectsList(),
    open: async (name, { force = false } = {}) => {
      if (hasUnsavedChanges() && !force) throw new Error("Bieżący projekt ma niezapisane zmiany — zapisz go (save()) albo wczytaj z { force: true }.");
      const all = await getSavedProjectsList();
      const low = String(name).toLowerCase();
      const hits = all.filter((p) => p.toLowerCase() === low).length ? all.filter((p) => p.toLowerCase() === low) : all.filter((p) => p.toLowerCase().includes(low));
      if (hits.length !== 1) throw new Error(hits.length ? `Kilka projektów pasuje: ${hits.join(", ")}` : `Nie ma projektu „${name}”.`);
      if (!(await loadProjectFromCloud(hits[0]))) return false;
      updateRoom();
      refresh();
      return hits[0];
    },
    // save() — pod nazwą wczytanego projektu; save("Nazwa") — pierwszy zapis nowego projektu
    // (nigdy nie nadpisuje innego, istniejącego projektu).
    save: async (name) => {
      let id = state.loadedProjectId;
      if (name && name !== id) {
        if ((await getSavedProjectsList()).includes(name)) throw new Error(`Projekt „${name}” już istnieje — nie nadpisuję go.`);
        id = name;
        state.project.name = name;
      }
      if (!id) throw new Error("Podaj nazwę nowego projektu: save(\"Nazwa\").");
      await saveProjectToCloud(id);
      return state.loadedProjectId;
    },
    overview: () => api.projectOverview(),
    module: (ref) => JSON.parse(JSON.stringify(mod(ref))),
    info: (ref) => getModuleSummary(mod(ref), state.project),
    zones: zonesOf,
    parts: (ref) => calculateModuleParts(mod(ref)).parts,
    check: () => api.projectIssues(),

    select: change((ref) => { state.activeModuleId = mod(ref).id; return mod(ref).name; }),
    set: change((ref, patch) => { const m = mod(ref); api.patchModule(m, patch); return api.projectOverview().modules.find((x) => x.id === m.id); }),
    split: change((ref, path, axis, at) => { api.splitZone(mod(ref), path, axis, at); return zonesOf(ref); }),
    shelves: change((ref, path, count) => { api.addShelves(mod(ref), path, count); return zonesOf(ref); }),
    front: change((ref, path, subtype, opts) => { api.setFront(mod(ref), path, subtype, opts); return zonesOf(ref); }),
    clearFronts: change((ref, path) => { api.clearFronts(mod(ref), path); return zonesOf(ref); }),
    moveDivider: change((ref, path, pos) => { api.moveDivider(mod(ref), path, pos); return zonesOf(ref); }),
    structural: change((ref, path, yes) => { api.setStructural(mod(ref), path, yes); return zonesOf(ref); }),
    removeDivider: change((ref, path) => { api.removeDivider(mod(ref), path); return zonesOf(ref); }),
    add: change((type) => addModule(type).name),
    duplicate: change((ref) => duplicateModule(mod(ref).id)?.name),
    splitPoints: (ref) => api.splitPoints(mod(ref)),
    splitCabinet: change((ref, opts) => api.splitCabinet(mod(ref), opts)),
    remove: change((ref) => { const m = mod(ref); deleteModule(m.id); return `Usunięto „${m.name}”`; }),
    align: change((refs, edge) => { const s = moveSel(refs); alignSelection(state.project, s.sel, s.refId, edge); return positions(s.mods); }),
    push: change((refs, dir) => { const s = moveSel(refs); pushSelection(state.project, s.sel, s.refId, dir); return positions(s.mods); }),
    pack: change((refs) => { const s = moveSel(refs); packSelection(state.project, s.sel, s.refId); return positions(s.mods); }),
    panel: change((kind, props) => JSON.parse(JSON.stringify(api.addPanel(kind, props)))),
    setPanel: change((ref, patch) => JSON.parse(JSON.stringify(api.patchPanel(api.findPanel(ref), patch)))),
    removePanel: change((ref) => {
      const p = api.findPanel(ref);
      state.project.sidePanels = state.project.sidePanels.filter((x) => x !== p);
      if (state.activeSidePanelId === p.id) state.activeSidePanelId = null;
      return `Usunięto „${p.name}”`;
    }),

    undo: () => { const ok = undo(); if (ok) { updateRoom(); refresh(); } return ok; },
    redo: () => { const ok = redo(); if (ok) { updateRoom(); refresh(); } return ok; },
  };
}
