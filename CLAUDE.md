# CLAUDE.md

Ten plik zawiera wskazówki dla Claude Code (claude.ai/code) do pracy z kodem w tym repozytorium.

## Czym jest ten projekt

„Generator Stolarski Next” — aplikacja przeglądarkowa do projektowania wielomodułowych zabudów
stolarskich (kuchnie, szafy) i generowania list formatek, list okuć oraz rysunków 2D z
wierceniami. Czyste moduły ES + Vite + Three.js. Firebase Firestore do przechowywania projektów
w chmurze. Funkcja serverless na Vercelu pośredniczy w wywołaniach Google Gemini przy imporcie
odręcznego szkicu do modułów.

**Język: wszystko po polsku, gdzie tylko się da** — komentarze w kodzie, teksty w interfejsie,
komunikaty commitów, prompt AI, dokumentacja (w tym ten plik) i odpowiedzi dla użytkownika.
Po angielsku zostają tylko identyfikatory w kodzie i nazwy z bibliotek/API.

## Polecenia

- `npm run dev` — serwer deweloperski Vite.
- `npm run build` — build produkcyjny do `dist/`.
- `npm run preview` — serwuje zbudowany `dist/`.
- `npm test` — Vitest w trybie watch. `npm run test:run` — pojedyncze uruchomienie (CI/pre-commit).
  Jeden plik: `npx vitest run src/core/drawerMath.test.js`. Jeden test: dodaj `-t "<nazwa>"`.

Testy leżą obok kodu jako `src/**/*.test.js` i pokrywają czystą logikę w `core/` i `engine/`
(plus kilka czystych helperów z `ui/`/`render/`); UI oparte na DOM i `viewer3d.js` nie mają
testów. Wspólne fixture'y: `src/test/fixtures.js`. Przy nowej funkcji obliczenia trafiają do
czystego modułu w `core/`/`engine/` z testem, a plik w `ui/` tylko je wyświetla — istniejący
kod trzyma się tego podziału.

`npm run lint` — ESLint (`eslint.config.js`), wyłącznie `js.configs.recommended` (bez reguł
stylu/formatowania) — łapie prawdziwe błędy (niezdefiniowane zmienne, puste bloki, zbędne
przypisania) bez przeformatowywania istniejącego kodu. Lint jest czysty i wszystkie reguły,
łącznie z `no-unused-vars` (nieużywane parametry i `catch (e)` są dozwolone), to błędy. CI (`.github/workflows/test.yml`) uruchamia
`npm run lint`, `npm run test:run` i `npm run build` przy każdym pushu / PR.

Endpoint `/api/gemini` działa tylko w środowisku serverless Vercela. Zwykłe `npm run dev` nie
serwuje `api/`, więc import szkicu AI lokalnie nie działa, chyba że uruchomisz `vercel dev` i
ustawisz `GEMINI_API_KEY`.

## Architektura

Jedna strona, bez routera, bez frameworka, bez reaktywnego store'a. `index.html` ładuje
`src/main.js`, który startuje w kolejności: `initLayout()` → `initPropertiesPanel()` →
`updateSidebar()` → `init3DViewer()`.

### Stan

`src/core/state.js` eksportuje jeden mutowalny obiekt `state`. Wszystko modyfikuje go
bezpośrednio.

- `state.project` — `materials`, `construction`, `front`, `room` (**domyślne** wartości dla
  całego projektu) plus `modules[]`.
- `state.activeModuleId`, `state.loadedProjectId`.
- Helpery modułów: `addModule`, `deleteModule`, `duplicateModule`, `getActiveModule`.

**Moduł** ma `dimensions {width,height,depth}`, `position {x,y,z}` (mm, bezwzględnie w
układzie pokoju), `backPanel`, `legs`, `front` (lokalne nadpisania) i `elements[]`.
`mod.front`, `mod.construction`, `mod.backPanel` zawsze rozkłada się **na** domyślne wartości
projektu (`{ ...state.project.front, ...mod.front }`) — scalaj, nigdy nie wybieraj jednej strony.

**Element** ma typ w polu `typ`:
- `'front'` z `subtype` `szuflada` | `szuflada-wewnetrzna` | `drzwi` | `drzwi-lp`. Ma
  `baseZone` (granice min/max X/Y, każda opcjonalnie powiązana z id innego elementu albo z
  krawędzią korpusu `cab-left|right|top|bottom`), `frontIndex` i napis `distribution`
  (`"1:1:1"`, `"3fr:100"` albo zwykła liczba).
- `'poziom'` — półka. `isStructural: true` = półka konstrukcyjna (stała); false = ruchoma.
- `'pion'` — przegroda pionowa.

### Solver układu

`src/core/layout.js` — `recalculateLayout(mod)` to silnik geometrii. Zamienia `baseZone` +
`distribution` + luzy/szczeliny + matematykę nakładania (nakładane vs wpuszczane) każdego
frontu na konkretne `el.x / el.y / el.w / el.h`. To jedyne źródło prawdy o pozycjach frontów —
silnik formatek czyta wyliczone `el.h/el.w`, nie liczy ich ponownie. Czysta funkcja na `state`,
bez Three.js. Fronty liczą się w kolejności powiązań (`elementsInBoundOrder`): front przypięty `bound*`
do innego frontu po nim, niezależnie od kolejności w `mod.elements`.

`update3D()` woła go dla każdego modułu przy renderowaniu. `calculateParts()`,
`calculateAllProjectParts()` i `calculateProjectHardware()` najpierw wołają
`recalculateAllLayouts()`, więc listy formatek są poprawne nawet bez wcześniejszego renderu
(wcześniej nie były — przy starcie `initPropertiesPanel()` rusza przed `init3DViewer()`).

### Silnik formatek

`src/engine/cabinet.js`:
- `calculateParts()` — aktywny moduł: `{ parts, mountingData }` (mountingData zasila rysunki
  2D z wierceniami).
- `calculateAllProjectParts()` — cały projekt, zagregowana lista formatek, w tym scalone
  odcinki cokołu przez sąsiednie szafki dolne. Odcinek dłuższy niż arkusz (`project.cutPlan`,
  dłuższy bok minus obrzeże) dzieli `engine/plinthSplit.js` na „część i/n” łączone na stykach
  szafek (najmniej części, potem najrówniejsze). Render 3D rysuje cokół osobno pod każdą szafką.

Obok, w `src/engine/`: `carcaseParts.js` (formatki i wiercenia korpusu prostokątnego; `jointSetPositions` —
jedyne miejsce rozmieszczenia zestawów kołek + wkręt dla wieńców, półek stałych i przegród: skrajne 37 mm od przodu
i tyłu, środkowe gdy odstęp > `construction.jointSpacing` (domyślnie 250 mm), w rastrze 32 mm; z niego korzystają
rysunek boku 2D, instrukcje montażu i lista okuć, która liczy faktyczne zestawy zamiast ryczałtu),
`cornerParts.js` (wszystko o szafce narożnej, też dla rysunków 2D i 3D), `hardware.js`
(`calculateProjectHardware()` — okucia: nóżki, złącza, komplety szuflad, zawiasy, okleina) i
`cost.js` (`calculateProjectCost()` — kosztorys). Zależności idą w jedną stronę: `hardware`/`cost`
czytają wynik `cabinet.js`, a `cabinet.js` korzysta z `carcaseParts`/`cornerParts`.

Formatki są deduplikowane/sumowane po kluczu `category_name_length_width`.

### Matematyka dziedzinowa (`src/core/`)

- `drawerSystems.js` — **jedyny** katalog danych systemów szuflad (Blum antaro / tandembox /
  merivobox / legrabox, GTV Axis): potrącenia wymiarów, warianty wysokości, offsety montażowe.
  Nigdy nie duplikuj tych danych gdzie indziej; komentarze w pliku opisują błędy, które
  wcześniej z tego wynikły. Blum MOVENTO (`movento_katalog` / `movento_forum`) to
  skrzynka drewniana (`woodenBox: true`): bez wariantów, wysokość boku wpisywana przy
  szufladzie (`front.drawerSideHeight`), formatki 2 boki + dno między bokami + tył +
  czoło wewn. (`getDrawerComponents` zwraca wtedy też `sides`/`innerFront`); na liście formatek
  tył i czoło wewn. to jedna formatka „Tył/Przód szuflady …” × 2 (ten sam wymiar). Nazwy formatek
  szuflad nie zawierają szerokości szafki, żeby jednakowe formatki z różnych szafek się sumowały. Wiercenie
  prowadnic MOVENTO wg karty Blum: wkręty 38 mm nad wieńcem/półką pod szufladą
  (`calculateDrawerHoles(..., nl, zoneBottom)`), w poziomie `moventoRunnerHoles(system, nl)`.
- `drawerMath.js` — dobór długości nominalnej, dobór wariantu wysokości do dostępnego miejsca,
  wymiary elementów szuflady, pozycje wierceń `calculateDrawerHoles()` (luzy frontu podawaj
  scalone z szafką — ostatni parametr).
- `drawerSpec.js` — `drawerSpec(mod, el, project)`: **jedyne** miejsce parametrów szuflady
  zwykłej szafki (system, wnęka w świetle z `baseZone` — kolumna za przegrodą jest węższa,
  wysokość wnęki, głębokość i NL z frontem wpuszczanym / czołem szuflady wewn. / `forceNL`,
  składniki skrzynki). Korzystają z niego lista formatek, lista okuć, obrys skrzynki
  (`drawerBoxes.js`) i 3D — nie licz tego ponownie gdzie indziej.
- `backPanel.js` — `resolveBackPanel(mod, project)` (domyślne ustawienia pleców = te z
  formularza) i `corpusInnerDepth(...)` (głębokość wieńców); nie pisz własnych fallbacków
  `mod.backPanel || {...}`.
- `hingeMath.js` — `calculateHinges()`: liczba zawiasów + pozycje Y puszek z omijaniem kolizji
  z półkami/przeszkodami (pętla przesuwania naprzemiennie o 1 mm). `cabinet.js` dodatkowo
  wylicza „globalne” zawiasy między modułami (nachodzenie odcisków z obrotem + ten sam obrót),
  żeby drzwi przechodzące przez kilka postawionych na sobie korpusów dostały zawiasy z
  sąsiednich modułów; przeszkody z szafek postawionych na sobie daje `stackedHingeObstacles`
  (wspólne dla rysunku wierceń i 3D).
- `shelfMath.js` — wiercenia półek w Systemie 32 i `autoDistributeShelves()`.

### Renderowanie

- `src/render/viewer3d.js` (~1600 linii) — scena Three.js, OrbitControls, przeciąganie modułów
  z przyciąganiem co 40 mm, edycja kliknięciem / menu kontekstowym, przełączniki widoczności
  (osobno: fronty, boki dokładane, blendy, blaty — „Ukryj fronty” chowa tylko fronty szafek), „tryb wyrównywania”. Właściciel sceny i `update3D()`. Render na żądanie
  (`requestRender`, zdarzenia tylko z płótna), rozmiar z `ResizeObserver` na kontenerze; przy
  schowanym widoku 3D (Wnętrze 2D) `update3D()` tylko ustawia `sceneDirty`, a scenę dobudowuje
  ponowne pokazanie. Po przebudowie `update3D()` przelicza `matrixWorld` (raycast tuż po
  przebudowie). Kliknięcie bez ruchu nie przebudowuje sceny drugi raz (`dragMoved`). Wydzielone z niego:
  - `meshBuilders.js` — materiały i budowanie brył (`addBox`, `addHole`, `addHardware`,
    `createLabelSprite`, `disposeObject`); trzyma flagę x-ray (`isXrayMode` / `setXrayMode`).
    Geometrie płyt/otworów, okucia i etykiety są współdzielone z cache (`userData.shared` —
    `disposeObject` ich nie zwalnia); nie modyfikuj geometrii siatki po `addBox`.
  - `cornerCabinet3d.js` — `renderCornerCabinet(mod, isActive, th, parentGroup)`.
  - `measureTool.js` — miarka; scenę/kamerę/raycaster dostaje raz przez `initMeasureTool()`.
  - Przyciąganie i kolizje przy przeciąganiu szafek są w `core/moduleDrag.js` (czyste, z
    testami): najbliższy kandydat (w tym fronty równo), a przeciągana szafka zatrzymuje się
    na sąsiadach — sąsiedzi nigdy nie są odpychani. Shift w trakcie ruchu blokuje jedną oś.
- `src/render/viewer2d.js` — `generateSidePanelSVG(height, depth, mountingData)` buduje
  rysunek techniczny SVG boku z wierceniami. Rysunki szafki narożnej (formatki w kształcie
  L, boki, fronty, wykrój) są w `cornerDrawing2d.js`. Kolory i fonty rysunków 2D (też
  `wallElevations.js`) biorą się z `drawingPalette.js` (`C.slate600`, `FONT`) — SVG są
  samodzielne (osobne okno, druk), więc nie używają tokenów CSS, ale nie wpisuj w nich hexów.

### Panele UI (`src/ui/`)

Wszystkie panele renderują się przez przypisanie szablonów tekstowych do `innerHTML`.

- `layout.js` — statyczny szkielet 3 kolumn: `.sidebar-left`, `.center-panel #editor-3d-container`,
  `.sidebar-right`.
- `sidebar.js` — lewy panel: lista modułów, przyciski dodawania, import szkicu AI. Okna
  wynikowe, które kiedyś w nim siedziały, mają własne pliki: `csvEditor.js` (eksport CSV),
  `kosztorysModal.js`, `hardwareList.js` (wydruk listy zakupów), `technicalDrawing.js` (okno
  rysunku 2D z wierceniami + wydruk pojedynczej formatki na A4).
- `properties.js` — prawy panel: formularze właściwości modułu i globalnych.
  `updateAll = () => { update3D(); updateSidebar(); }` to standardowe odświeżenie „coś się
  zmieniło”; pola tekstowe mają debounce 50 ms. Boki dokładane i blendy mają własny panel w
  `sidePanelProperties.js`, szafka narożna w `cornerProperties.js`, skos w `slopeProperties.js`
  (`initPropertiesPanel()` wybiera właściwy). Wszystkie składają panel z tych samych klocków
  `ui/propertiesShell.js` (przyklejony nagłówek z nazwą, zwijane sekcje ze wspólnym stanem
  otwarcia, blok pozycja + obrót z `bindModulePosition`) — nowy rodzaj szafki też ma z nich
  korzystać. Usuwanie jest tylko na liście w lewym panelu, nie w prawym. Karty „Szuflady —
  ustawienia ręczne” (wariant/wysokość boku, NL, wymiary frontu, szuflada wewnętrzna) są w
  `ui/drawerSettings.js`, wspólne dla zwykłej szafki i skosu (skos podaje własne `sideInfo`
  ze skrzynki liczonej pod skosem; `core/slopeCabinet.js` honoruje `forceVariant`/`forceNL`).
  Na górze prawego panelu zwijana karta „Informacje o szafce” (`ui/moduleInfoPanel.js`) —
  dane liczy czyste `core/moduleInfo.js` (`getModuleSummary`: wymiary korpusu/wnętrza, drzwi
  z zawiasami, szuflady z frontem i skrzynką, półki).

**Instrukcja obsługi**: przycisk „Pomoc” na górnym pasku i klawisz F1 (`ui/helpModal.js`); treść rozdziałów
w `ui/helpContent.js`. Przy zmianie nazwy przycisku/sekcji albo nowej funkcji zaktualizuj właściwy rozdział —
`helpContent.test.js` pilnuje, żeby nazwy sekcji huba i prawego panelu zgadzały się z instrukcją.

### Konwencje UI (spójny interfejs)

- Jeden zestaw fontów i skala typografii (`--font`, `--fs-*`) oraz jeden zestaw tokenów w
  `src/styles/global.css`; nie dodawaj w plikach własnego `font-family`, kolorów hex ani stylów
  przycisków inline — używaj wspólnych klas.
- **Przyciski**: `.btn` (drugorzędny), `.btn-primary` (jedna główna akcja na widok), `.btn-danger`,
  `.btn-sm`, `.icon-btn`.
- **Okna dialogowe**: zawsze `openModal()` z `src/utils/modal.js` (klasy `.modal-*`; Esc /
  kliknięcie w tło zamyka najwyższe). `showCustomDialog` (core/storage.js) i `showAlert`
  (utils/modal.js, zamiast natywnego `alert()`) są na nim zbudowane. Nie buduj nakładek ręcznie.
- **Listy**: `.list-item` (panele boczne), `.list-row` (w oknach); **pola**: `.field` + `.input`;
  **komunikaty**: `.notice-*`, `.badge-*`, `.empty-note`; tabele: `.hub-table` / `.cost-table`.
- **Jedno wejście na funkcję**: listy formatek, rysunki wierceń, lista zakupów, plan
  rozkroju/etykiety, kosztorys i kontrola projektu są tylko w hubie „Produkcja i raporty”
  (`ui/productionHub.js`). Lewy panel to wyłącznie Szafki / Boki dokładane / Narzędzia — nie
  dodawaj tam z powrotem zdublowanych list.

### Przepływ aktualizacji

Zmodyfikuj `state` → wywołaj `update3D()` i `updateSidebar()` → wywołaj też
`initPropertiesPanel()`, jeśli zmieniła się struktura formularza (a nie tylko wartości).
Przeciąganie w 3D samo woła te odświeżenia po puszczeniu myszy (`render/viewer3d.js`).

**Cofnij/ponów** (`core/history.js`) korzysta z tego przepływu: `update3D()` / `updateSidebar()` /
`initPropertiesPanel()` wołają `scheduleCheckpoint()`, który z debounce'em robi migawkę JSON
`state.project` + `activeModuleId`. Zmiana, która pomija standardowe odświeżenia, jest więc
niewidoczna dla cofania — nie omijaj ich.

**Edytor wnętrza**: `ui/interiorEditor.js` (widok 2D od frontu, dzielenie/obsadzanie/usuwanie
wnęk, przeciąganie dzielników) działa na `core/zoneTree.js`, który odtwarza `mod.elements` jako
drzewo BSP. Zakłada, że każdy `poziom`/`pion` w pełni rozpina swoją wnękę — nowy kod tworzący
półki/przegrody musi zachować to założenie, inaczej odtwarzanie drzewa się psuje.

**Geometria pokoju**: moduły mają `mod.rotation` (wielokrotności 90°; mówi, do której ściany
zwrócony jest tył — 0 tylna z=0, 90 prawa, 180 przednia, 270 lewa). `core/walls.js` rzutuje
szafki na ściany (czysta logika; rysuje `render/wallElevations.js`), `core/worktops.js` wylicza
z tych rzutów odcinki blatów i łączenia w narożnikach. Szafki narożne
(`type: 'corner_cabinet'`, dwa ramiona, `ui/cornerConfigModal.js`) mają geometrię ramion
liczoną w `core/layout.js` (`getCornerArmRect`, `getCornerDepths`), a fronty używają
tokenów powiązań `corner-A-*`/`corner-B-*`.

**Szafka pod skos** (`type: 'slope_cabinet'`): `core/slopeCabinet.js` (czyste, z testami) + `render/slopeCabinet3d.js`
+ `ui/slopeProperties.js`. Wnętrze to zwykłe `mod.elements`, a skos dopiero przycina wynik `recalculateLayout`.
`engine/cabinet.js` i `hardware.js` dla skosu NIE idą przez zwykłe `getInteriorParts`/`getFrontsAndDrawers`.
Łączenie korpusu skosu: `mod.slopeJoin` (kołek + wkręt albo Lamello Tenso/Clamex P — `getSlopeJoin`, dane łączników w
`core/lamello.js`, wspólne ze skrzynkami szuflad).

**Zabudowa wnęki pod skosem** (rząd szafek pod skosem poddasza): `core/slopeNiche.js` (czyste, z testami) —
`ceilingAt` (skos liniowy do `slopeRun`, dalej płaski sufit), `nicheModuleSlots` (`niche.shape`: `'skos'` —
szafka pod rosnącym skosem to `slope_cabinet` trapez, niski bok = sufit nad lewą krawędzią − luz, wysoki = nad prawą;
wszystkie szafki zabudowy na nóżkach z cokołem — nóżki/cokół rysuje wspólne `addLegsAndPlinth` z `meshBuilders.js`, a
cokół `slope_cabinet` liczy się w biegu cokołu w `calculateAllProjectParts`; szafka z siedziskiem i pod płaskim sufitem prostokątna; `'prostokat'` — schodki, wysokość = najniższy sufit
nad szafką − luz), `buildSlopeNicheModules` (wnętrze
przez `zoneTree`: półki stałe + `assignFront`/`addEvenShelves`; `mod.wardrobeRod` → drążek na liście okuć),
`applySlopeNiche` (zastępuje szafki z polem `slopeNiche`, ustawienia w `project.slopeNiche`, siedzisko = blat
projektu). Widok z przodu `render/slopeNicheDrawing.js`, okno `ui/slopeNicheModal.js` (Narzędzia).

**Skrzynki szuflad (MOVENTO)**: `core/drawerBoxBuild.js` (czyste, z testami) zbiera skrzynki drewniane z całego
projektu (`getDrawerBoxInfo` z `core/drawerBoxes.js`, skos przez `getSlopeFronts`), scala identyczne i liczy otwory
łączników wg `project.drawerBox`; rysunki `render/drawerBoxDrawing2d.js`, okno `ui/drawerBoxDrawings.js`.

**Instrukcje montażu szafek**: `engine/cabinetDrillings.js` (czyste, z testami) + `render/cabinetDrawing2d.js` +
okno `ui/cabinetInstructions.js`; dane z `calculateModuleParts(mod)` (to samo co `calculateParts()` dla dowolnej
szafki). Wspólne klocki rysunków w `render/workshopDrawing.js`. Szafka narożna: `engine/cornerDrillings.js`
(boki ramion, listwa, wieńce/półki L z otworami z `cornerParts.js`) + `render/cornerInstructions2d.js`. Skos:
`engine/slopeDrillings.js` (otwory z `getSlopeDrillings`) + `render/slopeInstructions2d.js`.

**Stół RC System**: `core/rcSystem.js` (czyste, z testami), ustawienia `project.rcSystem`. Model listwy z pomiarów w
warsztacie (pin n = 16·n mm od zera listwy, pin Ø5, od pinu do wiertła 37 mm, między zerami 667 mm, maks. formatka 650 mm);
`rcRearScrew` / `rcMidGrid` przesuwają tylny i środkowe zestawy łączników w `jointSetsFor` (`carcaseParts.js`) — wszędzie:
rysunek 2D, instrukcje, okucia. Szczegóły w docs/szczegoly-funkcji.md.

**Plan rozkroju**: `engine/nesting.js` — „półkowe” układanie formatek na arkuszach z cięciami na
wylot (sprawdza kilka orientacji, wybiera najmniej arkuszy), wyświetlane przez
`ui/cutPlanModal.js`.

**DXF frontów na CNC**: `engine/frontsDxf.js` (czysta, z testami) — formatki kategorii „Front” ułożone przez
`nestPartsFree` (MaxRects), osobno dla każdego materiału frontu, zapis DXF R12; karta `ui/frontsDxfPanel.js`.

Szczegóły (stałe z kart producentów i pomiarów z warsztatu, wymiarowanie rysunków, łączniki Lamello, kalibracja
stołu RC, obrysy frontów skosu): **[docs/szczegoly-funkcji.md](docs/szczegoly-funkcji.md)** — przeczytaj przed
zmianą tych funkcji.

### Zapis danych

`src/core/storage.js` — Firebase Firestore, kolekcja `projects`, id dokumentu = nazwa projektu.
`saveProjectToCloud` / `loadProjectFromCloud` / `deleteProjectFromCloud` /
`getSavedProjectsList`. Eksportuje też `showCustomDialog(type, title, msg, ...)` — okno oparte
na promise, używane zamiast natywnych `confirm` / `prompt`. Konfiguracja Firebase web jest
w kodzie (z założenia jest publiczna).

`applyProjectData(data, projectId)` to jedyne przejście, przez które musi przejść każdy wczytany
projekt (z chmury, przywrócenie z historii wersji, przywrócenie lokalnej kopii), zanim stanie
się `state.project`. Najpierw waliduje `data` przez `core/projectSchema.js` (Zod, tylko
sprawdzenia struktury — `modules` jest tablicą, każdy moduł ma `id`/`type`/`dimensions`/tablicę
`elements`, reszta przechodzi bez zmian) i zwraca `false` bez ruszania `state.project`, jeśli
dane są uszkodzone, zamiast psuć działającą aplikację w połowie zastosowanymi śmieciami.
Wywołujący muszą sprawdzać zwracaną wartość.

**Otwory (okna/drzwi/przeszkody)**: `project.openings[]` (na najwyższym poziomie, NIE w `room`,
bo okno pokoju podmienia `project.room` w całości) — `core/openings.js` (ściana + `u` od lewego
końca ściany patrząc z wnętrza pokoju, szerokość, wysokość, parapet). Edytowane w oknie pokoju
(`ui/roomPanel.js`), rysowane w 3D (`viewer3d.js` rebuildRoomGeometry, przyciemniane razem ze
ścianą) i w rzutach ścian (`wallElevations.js`), sprawdzane względem szafek w `core/validate.js`.

**Blendy** to samodzielne elementy jak „boki dokładane”: wpisy w `project.sidePanels` z
`kind: 'blenda'` (`addBlenda` w `core/state.js`; `dimensions` = widoczna szerokość × wysokość ×
całkowita głębokość, `flange` = która krawędź listwy frontowej ma kołnierz montażowy). Używają
kodu przeciągania/przyciągania/listy/właściwości boków dokładanych i dają dwie formatki
(listwa frontowa, montaż wewnętrzny). Stare `mod.fillers` na module jest migrowane przez
`migrateLegacyFillers` (wołane z `ensureSidePanelsDefaults`: przy starcie, wczytaniu projektu,
cofaniu i wstawieniu szablonu z biblioteki) i usuwane — reszta kodu nie czyta już `mod.fillers`.
Nowa droga wprowadzania modułów do projektu musi też przejść przez `ensureSidePanelsDefaults`.
Stronę zawiasów pojedynczych drzwi wybiera się w edytorze wnętrza („Drzwi - zawias z
lewej/prawej”), nie w zakładce Front.

**Przyciąganie boków dokładanych**: `core/sidePanelSnap.js` (`snapSidePanel`, czysta, z testami)
działa przy przeciąganiu i dodawaniu „boku dokładanego”: przyciąga do boków szafek **łącznie z
blendami**, wyrównuje krawędzie tył/przód, do ścian tylko gdy nie złapał żadnej szafki, i
wypycha bok z każdej szafki/boku, na który nachodzi (najbliższe wolne miejsce w pokoju, najpierw
w bok). Samo przeciąganie śledzi podstawę boku na płaszczyźnie podłogi (zakotwiczone do ekranu),
a nie na płaszczyźnie wysokości chwytu.

**Okleinowanie**: `engine/edgeBanding.js`. Domyślnie wszystkie cztery krawędzie (żadna dla
„Plecy”/„Blat”); `project.edgeBanding` mapuje klucz formatki `category|name|length|width` (ta
sama tożsamość co w zagregowanej liście formatek, więc dotyczy wszystkich identycznych formatek)
na wartości logiczne `[long1,long2,short1,short2]`. Formatka z `materialId` ma klucz z materiałem na końcu
(osobne ustawienia dla tych samych wymiarów w różnych materiałach; stary klucz bez materiału działa zapasowo). Edytowane kliknięciem krawędzi ikonki w
tabeli Formatki w hubie (`ui/edgeBandingUi.js`); zasila metry w Okuciach/kosztach i etykiety
planu rozkroju.

**Rozmieszczanie szafek na ścianie**: `core/wallFill.js` (czyste, z testami) + okno `ui/wallFillModal.js`
(przycisk w Narzędziach). Jeden rząd na raz (dolne / wiszące / słupki, wymiary z `createModuleObject` albo z
szafki-wzoru, kopiowanej z wnętrzem przez `cloneModuleWithNewIds`). `findFreeSegments` wylicza wolne odcinki ściany
w pasie rzędu (głębokość + front, wysokość rzędu): blokują szafki/boki/blendy (też z sąsiedniej ściany w
narożniku), otwory na ścianie (z odstępem) i strefa przejścia przed drzwiami. `divideSegment` — tryby `standard`
(katalog szerokości, najmniejsza reszta, potem bliżej 600 mm), `equal`, `fixed` (`600, *, *`), `ratio` (jak
`distribution` frontów); reszta na blendę (`project.sidePanels`, lico równo z frontami) albo rozciągnięcie szafek.
`wallToWorld`/`worldToWall` — przeliczenie pas ściany ↔ pokój (oś X szafki zawsze rośnie z `u`).
Edycja wstawionego rzędu (przycisk „Zmień podział rzędu” w sekcji Wymiary prawego panelu): `findRowAround` rozpoznaje
rząd geometrycznie (stykające się szafki tego samego typu, obrotu, odsunięcia od ściany i wysokości + blendy na końcach —
działa też dla rzędów ustawionych ręcznie; bez szafek narożnych/ślepych), okno startuje w trybie „Stałe + reszta” z obecnymi
szerokościami, a `findFreeSegments(..., { ignoreIds })` nie traktuje szafek rzędu jako przeszkód. `replaceFillRow` zmienia
rząd na miejscu: szafki używane ponownie po kolei od lewej (wnętrza zostają), brakujące = kopie zaznaczonej, nadmiarowe usuwane,
blendy rzędu zastępowane nowymi.
Odsunięcie tyłu szafek od ściany (szczelina na instalacje): `project.wallFill.wallGap` per rząd
(`getWallGap`/`setWallGap`; bez ustawienia dolne i słupki 50, wiszące 0), pole w oknie. Tak samo w projekcie zapisane są
odstęp od otworów i strefa przed drzwiami (`project.wallFill.openingMargin`/`doorPassage`, `getClearance`/`setClearance`,
domyślnie 50/600) — też w trybie „Zmień podział rzędu”. Funkcje `core` dostają je
jawnie (`opts.wallGap`, domyślnie 0). `rowProfile(..., { wallGap })` daje `gap` i `frontPlane` = odsunięcie +
korpus z plecami + front (`frontAllowance(project, mod)` = grubość płyty + odsunięcie frontu od korpusu
`front.bodyGap`, domyślnie 2 mm — `frontBodyGap` w `core/state.js`, pole w zakładce Front; to samo odsunięcie
rysuje 3D frontów i blend; front wpuszczany = 0) — od `frontPlane` liczą się narożniki L/U (szafka L
odsunięta od obu ścian, odsunięcie szafki ślepej, blenda, zaślepka, przejście U). Obrys szafek w `findBlocked`
obejmuje front, więc szafka z prostopadłej ściany odcina pas aż do lica swoich frontów. Blat (`worktops.js`)
przykrywa szczelinę (dochodzi do ściany) i liczy `overhang` przed frontami; kontrola projektu ostrzega < 15 mm.
Tryb „Kuchnia L/U” w tym samym oknie: `core/kitchenRun.js` (czyste, z testami) — `planKitchenRun` liczy plan na
kopii projektu (podmienia `state.project` jak `validate.js`): najpierw narożniki (`L` = szafka narożna S×S,
`blind` = szafka ślepa odsunięta tak, by drzwi minęły lico frontów sąsiedniej ściany + blendę narożną, `dead` =
zaślepka + blenda), potem `findFreeSegments` + `divideSegment` na każdej ścianie z resztą z dala od narożnika;
`applyKitchenRun` dokłada gotowe obiekty. Ściany w kolejności zgodnej z zegarem (koniec ściany = początek
następnej), ostrzeżenie o przejściu w U < 1200 mm.
Zmiana istniejącej kuchni L/U (przycisk „Zmień podział kuchni L/U” w prawym panelu zwykłej szafki i szafki narożnej):
`findKitchenRunAround` rozpoznaje geometrycznie ściany połączone narożnikami (szafka L, ślepa, zaślepka martwego
narożnika + blenda narożna), ich ustawienia, zasięg skrajnych ramion i obecne szerokości (`customFromRun` wpisuje je
jako własne szerokości odcinków); `planKitchenRun(..., { ignoreIds })` liczy, jakby kuchni nie było, a
`replaceKitchenRun` zmienia ją na miejscu (szafki na ścianie po kolei od lewej, szafka L / ślepa w tym samym
narożniku zachowują wnętrza; blendy i zaślepki od nowa).

**Szafka ślepa i okucia narożne**: szafka ślepa to zwykła szafka z `mod.blindCorner = { active, side, frontWidth,
fitting }` — `core/blindCorner.js` (czyste, z testami): `applyBlindCorner` na końcu `recalculateLayout` przycina
fronty do otworu drzwi, `getBlindPanel` daje zaślepkę części ślepej (formatka „Zaślepka szafki ślepej”, kategoria
Front; rysowana w 3D i w rzutach ścian), `blindGeometry().blindReach` = od boku po stronie ślepej do drzwi.
Mocowanie drzwi szafki ślepej `blindCorner.mount` (`BLIND_MOUNTS`): `'listwa'` (domyślne) — listwa
`stileWidth` (100 mm) między wieńcami przy krawędzi otworu, drzwi na zawiasie równoległym nakładanym Blum 79B9950
(prowadnik na tylnej płaszczyźnie listwy, `PARALLEL_PLATE_INSET` 21,5 mm), zaślepka przykręcona do listwy;
`'zaslepka'` — zawias równoległy wpuszczany 79B9550 na zaślepce; `'bok'` — zwykły zawias na boku z dala od narożnika
(Magic Corner). Stronę zawiasów wymusza `applyBlindCorner` (`blindHingeSide`); `mountingData` drzwi na listwie /
zaślepce ma `parallelMount`, więc otwory prowadników nie trafiają na bok (`cabinetDrillings.js` daje formatkę
„Listwa szafki ślepej” z otworami). `minOpening`/`mounts` w katalogu okuć → kontrola otworu w świetle i mocowania.
`core/cornerFittings.js` to **jedyny** katalog okuć narożnych (LeMans, Magic Corner, Cornerstone, karuzele…;
`kind: 'blind'` dla szafki ślepej, `'corner'` dla `mod.cornerFitting` szafki L) — pozycja na liście okuć
(`hardware.js`) i ostrzeżenia wymiarów w kontroli projektu. UI: sekcja „Narożnik” (`ui/blindCornerProperties.js`).

**Kontrola projektu**: `core/validate.js` (`validateProject`) zasila sekcję huba „Kontrola
projektu” (`ui/projectCheck.js`): kolizje, granice pokoju, za szerokie drzwi/półki, formatki
niemieszczące się w płycie, otwory. Narożniki: `core/cornerChecks.js` (czyste, z testami) — front przy narożniku
vs lico frontów prostopadłego ciągu (błąd, gdy zachodzi; ostrzeżenie < 30 mm), szafka narożna L w kolizjach jako
dwa ramiona (`footprintBoxes`), przejście między dolnymi ciągami naprzeciw siebie (< 1200 ostrzeżenie, < 1067 błąd).

**Materiały frontów**: fronty mają własny cennik, a nie jedną wspólną cenę jak pozostałe
kategorie formatek (Korpus/Szuflada/Plecy mają po jednej cenie zł/m²) —
`project.pricing.frontMaterials[]` (`{id, name, pricePerM2}`, `core/state.js:
ensurePricingDefaults`, zmigrowane ze starej pojedynczej wartości `pricing.materials.Front`
jako pozycja „Standard”, żeby nikt nie stracił wpisanej ceny). Każdy front może mieć
`front.materialId` (wybierany per front w zakładce Front w `ui/properties.js`); brak albo
wskazanie na usuniętą pozycję po cichu przechodzi na pierwszą pozycję cennika
(`engine/cost.js: calculateProjectCost` — celowo bez wiersza „nieznany materiał”). Ten sam
cennik i ta sama zasada dotyczą samodzielnych „boków dokładanych” i blend —
`sidePanels[].materialId`, wybierane przez wspólne `materialSelectHtml()`/`bindSidePanelInputs()`
w `ui/sidePanelProperties.js` (ich formatka też ma kategorię `"Front"`, patrz
`getSidePanelParts`/`getBlendaParts` w `engine/cabinet.js`). Klucze tożsamości formatek w
`calculateParts`/`calculateAllProjectParts` zawierają `materialId`, więc dwa fronty o tych
samych wymiarach w różnych materiałach nigdy nie zleją się w jeden wiersz listy.
`ui/kosztorysModal.js` renderuje po jednym edytowalnym wierszu na pozycję cennika
(dodaj/zmień nazwę/usuń) w istniejącej tabeli „Materiały płytowe” i woła
`initPropertiesPanel()` po zmianach struktury cennika, żeby wybór materiału przy froncie był
aktualny.

**Oferta dla klienta**: `core/offer.js` (czysta: ustawienia w `project.offer`, `buildOfferHtml`)
+ karta „Oferta dla klienta” w sekcji Kosztorys huba (`ui/productionHub.js`). Pokazuje tylko
zakres + brutto/netto/VAT (bez kosztów/marży); obraz 3D pochodzi z `captureViewerSnapshot()`
(`render/viewer3d.js`, bieżący widok kamery).

**Biblioteka szafek**: `core/moduleLibrary.js` + `ui/moduleLibraryModal.js` (przycisk „Biblioteka
szafek” w lewym panelu) przechowują szablony modułów w `localStorage` (eksport/import JSON do
przenoszenia między komputerami). Wstawianie idzie przez `addModuleFromTemplate` /
`cloneModuleWithNewIds` (`core/state.js`), które przemapowują id elementów **oraz** odwołania
`baseZone.bound*` między elementami (używane też przez `duplicateModule`).

**Baza cen**: `core/priceLibrary.js` (rząd przycisków na górze Kosztorysu,
`ui/kosztorysModal.js`) — jedna migawka `project.pricing` w `localStorage` (ceny płyt/okuć,
cennik materiałów frontów), którą można zapisać z jednego projektu i zastosować w innym, żeby
nie przepisywać cen przy każdym nowym projekcie. Ten sam wzorzec zapisu/eksportu co biblioteka
szafek, ale jeden slot (nie nazwana lista), bo nie ma realnej potrzeby kilku cenników naraz.
`applyPriceDefaults` nigdy nie usuwa niczego, czego migawka nie zna — tylko nadpisuje pasujące
kategorie płyt/okuć i dopasowuje materiały frontów **po nazwie** (nie po id, bo id są
generowane niezależnie w każdym projekcie), aktualizując cenę albo dodając brakujący.

**Lokalna kopia zapasowa**: `core/localBackup.js` trzyma w `localStorage` kopię
*niezapisanej* pracy (co 20 s i przy ukryciu karty; czyszczona, gdy projekt zgadza się z kopią
w chmurze). Przy starcie `main.js` proponuje jej przywrócenie; przywrócony projekt celowo NIE
jest powiązany z projektem w chmurze (`loadedProjectId = null`), żeby autozapis nigdy niczego
po cichu nie nadpisał. Uszkodzona kopia (odrzucona przez `applyProjectData`) jest usuwana.

**Dane z zewnątrz**: `applyProjectData` i `cloneModuleWithNewIds` (szablony z biblioteki / pliku)
przepuszczają dane przez `core/projectSanitize.js`: wymiary i pozycja jako liczby, z napisów
technicznych (id, powiązania, ustawienia) znikają znaki HTML/JS (`< > " ' & \` i grawis); tekst użytkownika (`name`, `decor`,
oferta…) zostaje i musi iść przez `escapeHtml`. Nowe pole z wolnym tekstem dopisz do `FREE_TEXT_KEYS`.

**Zapis a autozapis**: `storage.js` liczy „generację” projektu (wczytanie, ręczny zapis, usunięcie);
autozapis sprawdza ją po każdym `await` i rezygnuje (`stale`), zamiast nadpisać cudzy znacznik
zapisu albo odtworzyć usunięty dokument. „Zapisz jako NOWY” pod istniejącą nazwą pyta o nadpisanie.
Przywrócenie wersji najpierw zapisuje ją w chmurze, dopiero potem podmienia stan aplikacji.
Skróty Ctrl+Z/Y i R nie działają przy otwartym oknie (`.modal-overlay`/`.hub-overlay`), a zmiany
ustawień w hubie (oferta, ceny, rozkrój, DXF) wołają `scheduleCheckpoint()`.

**Historia wersji**: przed nadpisaniem projektu w chmurze (ręczny zapis, autozapis najwyżej raz
na 10 min, przywrócenie) `storage.js` archiwizuje poprzednią zawartość w podkolekcjach
`projects/{id}/versions` (metadane, do listy) i `projects/{id}/versionData` (pełny JSON
projektu jako napis), zachowując 60 najnowszych. UI: `ui/versionHistory.js` (przycisk
„Historia”). Wymaga reguły dla podkolekcji w `firestore.rules`. Testy mockują Firestore w
pamięci (`core/storage.test.js`).

**Logowanie**: lista dozwolonych kont Google (wszystkie współdzielą kolekcję `projects`).
Logowanie Google (`signInWithGoogle` / `signOutUser` / `onAuthChange` / `getCurrentUser`,
podpięte w `main.js`, przycisk w `layout.js`). Każda funkcja chmurowa przerywa przez
`requireOwner()`, jeśli zalogowanego e-maila nie ma w `ALLOWED_EMAILS` (`core/access.js`, wspólne z
`api/gemini.js`).
Prawdziwą bramką jest `firestore.rules` (te same e-maile) — jednorazowa konfiguracja konsoli
(włączenie dostawcy Google, publikacja reguł) jest opisana w `FIREBASE.md`. Sprawdzenie po
stronie klienta służy tylko do czytelnego komunikatu błędu.
Dodanie/usunięcie użytkownika = edycja `ALLOWED_EMAILS` w `core/access.js` **i** listy w
`isOwner()` w `firestore.rules`, potem ponowna publikacja reguł.

### Import szkicu AI

`api/gemini.js` to funkcja Vercela: POST `{ base64Image, mimeType }` z nagłówkiem
`Authorization: Bearer <token ID Firebase>` (`getIdToken()` ze `storage.js`). Token sprawdza
`api/_lib/firebaseToken.js` (podpis RS256 kluczami Google przez WebCrypto, bez firebase-admin), e-mail musi
być w `core/access.js` — bez tego 401/403 i nic nie idzie do płatnego Gemini. Walidacja zapytania i
wyciąganie tablicy z odpowiedzi: `api/_lib/sketch.js`; klucz w nagłówku `x-goog-api-key`, limit czasu 55 s.
Odpowiedź: `{ modules: [...] }`. Klient zmniejsza zdjęcie do 1600 px (limit 4,5 MB Vercela), a dane od
modelu traktuje jako niezaufane: `core/aiSketchImport.js` (`sanitizeAiModules` — biała lista typów,
zakresy wymiarów; `buildModulesFromAi` — szafki z `createModuleObject`). Pomocnicze pliki i testy
funkcji leżą w `api/_lib/` (Vercel nie robi z `_` endpointów — nie kładź testów bezpośrednio w `api/`).
Wymaga zmiennej środowiskowej `GEMINI_API_KEY` na Vercelu.

## Konwencje i pułapki

- **XSS**: UI budowane jest z szablonów tekstowych przez `innerHTML`. Każda wartość pochodząca
  od użytkownika (nazwa modułu, nazwa projektu wczytana z Firestore) musi przejść przez
  `escapeHtml()` z `src/utils/dom.js` przed wstawieniem.
- **Jednostki**: wszystkie wymiary w milimetrach.
- **Helpery liczbowe** (`num` — liczba z pola albo wartość domyślna, `round1`, `fmtMm`,
  `evalDimensionExpr`) są w `src/utils/math.js` — importuj je, nie kopiuj do kolejnych plików.
- **Scalanie domyślnych**: lokalne pola `mod.front` / `mod.construction` / `mod.backPanel`
  nadpisują domyślne wartości projektu przez rozłożenie obiektu — zawsze czytaj je scalone.
- Tylko ESM (`"type": "module"` w package.json); brak `vite.config.*` — domyślne ustawienia Vite.
- Angielskie identyfikatory w kodzie: `tall_cabinet` = słupek, `upper_cabinet` = szafka
  wisząca, `corner_cabinet` = szafka narożna, `sidePanels` = boki dokładane i blendy,
  `backPanel` = plecy, `legs` = nóżki, `openings` = otwory w ścianach, `edgeBanding` =
  okleinowanie, `worktops` = blaty. Formatki wieńców mają nazwy `W###`.
