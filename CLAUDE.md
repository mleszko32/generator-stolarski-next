# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Generator Stolarski Next" — a browser app for designing multi-module carpentry cabinet runs
(kitchens, wardrobes) and generating cut lists, hardware lists and 2D drilling drawings.
Vanilla ES modules + Vite + Three.js. Firebase Firestore for cloud project storage. A Vercel
serverless function proxies Google Gemini for importing a hand sketch into modules.

All code comments, UI strings, commit messages and the AI prompt are in Polish. Keep new
user-facing text and comments Polish to match.

## Commands

- `npm run dev` — Vite dev server.
- `npm run build` — production build to `dist/`.
- `npm run preview` — serve the built `dist/`.
- `npm test` — Vitest in watch mode. `npm run test:run` — single run (CI/pre-commit).
  One file: `npx vitest run src/core/drawerMath.test.js`. One test: add `-t "<name>"`.

Tests are co-located as `src/**/*.test.js` and cover the pure domain math
(`core/drawerMath`, `core/hingeMath`, `core/shelfMath`, `core/layout`) and the cut-list /
hardware engine (`engine/cabinet`). Shared fixtures: `src/test/fixtures.js`. There is no
linter and no CI config.

The `/api/gemini` endpoint only runs under Vercel's serverless runtime. Plain `npm run dev`
does not serve `api/`, so AI sketch import fails locally unless you run `vercel dev` and set
`GEMINI_API_KEY`.

## Architecture

Single page, no router, no framework, no reactive store. `index.html` loads `src/main.js`,
which bootstraps in order: `initLayout()` → `initPropertiesPanel()` → `updateSidebar()` →
`init3DViewer()`.

### State

`src/core/state.js` exports one mutable `state` object. Everything mutates it directly.

- `state.project` — `materials`, `construction`, `front`, `room` (project-wide **defaults**)
  plus `modules[]`.
- `state.activeModuleId`, `state.loadedProjectId`.
- Module helpers: `addModule`, `deleteModule`, `duplicateModule`, `getActiveModule`.

A **module** has `dimensions {width,height,depth}`, `position {x,y,z}` (mm, absolute in room
space), `backPanel`, `legs`, `front` (local overrides), and `elements[]`. `mod.front`,
`mod.construction`, `mod.backPanel` are always spread **over** the project-level defaults
(`{ ...state.project.front, ...mod.front }`) — merge, never pick one side.

An **element** is typed by `typ`:
- `'front'` with `subtype` `szuflada` | `szuflada-wewnetrzna` | `drzwi` | `drzwi-lp`. Carries a
  `baseZone` (min/max X/Y bounds, each optionally bound to another element's id or a cabinet
  edge `cab-left|right|top|bottom`), a `frontIndex`, and a `distribution` string
  (`"1:1:1"`, `"3fr:100"`, or a plain count).
- `'poziom'` — shelf. `isStructural: true` = fixed carcase shelf; false = adjustable.
- `'pion'` — vertical divider.

### The layout solver

`src/core/layout.js` — `recalculateLayout(mod)` is the geometry engine. It resolves every
front's `baseZone` + `distribution` + clearances/gaps + overlay math (nakładane vs
wpuszczane) into concrete `el.x / el.y / el.w / el.h`. It is the single source of truth for
front positions — the parts engine reads the resolved `el.h/el.w`, it does not recompute
them. Pure function over `state`, no Three.js.

`update3D()` calls it per module while rendering. `calculateParts()`,
`calculateAllProjectParts()` and `calculateProjectHardware()` each call
`recalculateAllLayouts()` first, so cut lists are correct without a render pass having run
(they weren't, before — `initPropertiesPanel()` runs before `init3DViewer()` on load).

### Parts / cut-list engine

`src/engine/cabinet.js`:
- `calculateParts()` — active module: `{ parts, mountingData }` (mountingData drives the 2D
  drilling drawings).
- `calculateAllProjectParts()` — whole project, aggregated cut list, including merged plinth
  (`cokół`) runs across adjacent base cabinets.
- `calculateProjectHardware()` — hardware counts (legs, joints, drawer kits, hinges).

Parts are deduped/summed by a `category_name_length_width` key.

### Domain math (`src/core/`)

- `drawerSystems.js` — **the** catalog of drawer-system data (Blum antaro / tandembox /
  merivobox / legrabox, GTV Axis): dimensional deductions, height variants, mounting offsets.
  Never duplicate this data elsewhere; file comments document past bugs from doing so.
- `drawerMath.js` — nominal-length pick, height-variant pick by available space, drawer
  component sizes, `calculateDrawerHoles()` drilling positions.
- `hingeMath.js` — `calculateHinges()`: hinge count + cup Y positions with collision
  avoidance against shelves/obstacles (1 mm alternating nudge loop). `cabinet.js`
  additionally derives cross-module "global" hinges so a door spanning stacked carcases gets
  hinges from neighbouring modules.
- `shelfMath.js` — System-32 shelf drilling and `autoDistributeShelves()`.

### Rendering

- `src/render/viewer3d.js` (~1800 lines) — Three.js scene, OrbitControls + TransformControls,
  drag-to-move modules with 40 mm snapping, click / context-menu editing, x-ray and
  fronts-visibility toggles, "align mode". Owns `update3D()`.
- `src/render/viewer2d.js` — `generateSidePanelSVG(height, depth, mountingData)` builds an SVG
  technical drawing of a side panel with drilling.

### UI panels (`src/ui/`)

All panels render by assigning `innerHTML` template strings.

- `layout.js` — static 3-column shell: `.sidebar-left`, `.center-panel #editor-3d-container`,
  `.sidebar-right`.
- `sidebar.js` — left panel: module list, add buttons, AI import, cut-list / hardware / CSV
  export, print, 2D drilling preview with pan/zoom.
- `properties.js` — right panel: per-module and global property forms.
  `updateAll = () => { update3D(); updateSidebar(); }` is the standard "something changed"
  refresh; text inputs are debounced 50 ms.

### Update flow

Mutate `state` → call `update3D()` and `updateSidebar()` → also call `initPropertiesPanel()`
if the form's structure (not just values) changed. `main.js` listens for a `cabinetMoved`
window event (dispatched by 3D drag) to re-render the properties panel.

### Persistence

`src/core/storage.js` — Firebase Firestore, collection `projects`, document id = project name.
`saveProjectToCloud` / `loadProjectFromCloud` / `deleteProjectFromCloud` /
`getSavedProjectsList`. Also exports `showCustomDialog(type, title, msg, ...)` — a
promise-based modal used instead of native `confirm` / `prompt`. The Firebase web config is
committed inline in this file.

### AI sketch import

`api/gemini.js` is a Vercel function: POST `{ base64Image, mimeType }`, it calls Gemini
(`gemini-flash-latest`) with a fixed Polish prompt and returns a JSON array of cabinet
modules. `sidebar.js` maps that JSON into `state.project.modules`, synthesising `elements`
and their `baseZone`s. Requires `GEMINI_API_KEY` as a Vercel env var.

## Conventions and gotchas

- **XSS**: UI is built from `innerHTML` template strings. Any user-derived value (module name,
  project name loaded from Firestore) must pass through `escapeHtml()` from `src/utils/dom.js`
  before interpolation.
- **Units**: every dimension is millimetres.
- **Merge defaults**: local `mod.front` / `mod.construction` / `mod.backPanel` fields override
  project defaults via object spread — always read them merged.
- ESM only (`"type": "module"` in package.json); no `vite.config.*` — plain Vite defaults.
- Polish domain vocab: korpus = carcase, bok = side, wieniec / `W###` = top/bottom panel,
  plecy = back panel, szuflada = drawer, drzwi = door (`drzwi-lp` = left+right pair),
  półka / poziom = shelf, pion = divider, słupek / `tall_cabinet` = tall unit,
  szafka wisząca / `upper_cabinet` = wall unit, blenda = filler panel, cokół = plinth,
  nóżki / legs, zawias = hinge, trawers = traverse rail, nut = groove,
  nakładane / wpuszczane = overlay / inset front.
