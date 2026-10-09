# Szczegóły funkcji

Uzupełnienie [CLAUDE.md](../CLAUDE.md): szczegóły modułów dziedzinowych (wymiary, stałe z kart
producentów i pomiarów z warsztatu, powiązania między plikami). Czytaj przed zmianami w danej funkcji.

## Szafka pod skos

**Szafka pod skos** (`type: 'slope_cabinet'`, przycisk „+ Skos”): `core/slopeCabinet.js` (czyste,
z testami) + `render/slopeCabinet3d.js` (bryły z wielokątów, `meshBuilders.addPrism`) +
`ui/slopeProperties.js` + rysunki cięcia (`render/slopeDrawing2d.js`, `ui/slopeCutDrawings.js`).
Wnętrze to zwykłe `mod.elements` edytowane w „Wnętrze 2D”: `getCabinetInnerRect` / granice `cab-*`
w `recalculateLayout` zwracają dla skosu `getSlopeInnerRect` (prostokąt do najwyższego miejsca pod
skosem), a skos dopiero przycina wynik — przegrody/półki dostają cięcie pod kątem (`getSlopeBoards`,
nazwy z kątem pochylenia piły), fronty są docinane linią skosu (`clipFrontRect`), trójkąt albo
niemieszcząca się szuflada = blenda (`el.slopeBlenda` wymusza). Skrzynka szuflady A/B (`slope.drawerBox`);
w B tył i czoło wewn. mają skośną krawędź równoległą do skosu szafki (od góry niskiego boku), a
gdzie dojdą do wysokości wysokiego boku, idą poziomo (`box.backPoints`: trapez albo pięciokąt).
`engine/cabinet.js` i `hardware.js` dla skosu NIE idą przez zwykłe `getInteriorParts`/`getFrontsAndDrawers`.
Stare dane (`slope.columns`/`dividers`/`shelves`) zamienia `migrateSlopeModule` w `ensureSidePanelsDefaults`.

## Skrzynki szuflad (MOVENTO)

**Skrzynki szuflad (MOVENTO)**: `core/drawerBoxBuild.js` (czyste, z testami) zbiera skrzynki
drewniane z całego projektu (zwykłe szafki przez `getDrawerBoxInfo` z `core/drawerBoxes.js` — położenie
i wymiary skrzynki w widoku od frontu, te same wzory co 3D i lista formatek; skos przez `getSlopeFronts`, też
skrzynka B), scala identyczne i liczy otwory: łączniki wg `project.drawerBox` (domyślnie kołek +
wkręt na przemian; konfirmat / kołki / wkręty; odstępy to ustawienia, bo pochodzą z poradników;
albo Lamello P z frezarki Zeta P2 — `LAMELLO`: Tenso/Clamex P-10/P-14, rowek na powierzchni
75 mm dla P-14 i 60 mm dla P-10 (pomiary z warsztatu), oś łącznika 60 mm od końca formatki
(`lamelloEdge`, min. producenta 32/37), rozstaw maks. 300, Clamex z otworem Ø6 na klucz od wnętrza skrzynki) oraz
zaczep tylny prowadnicy Ø6×10 w tylnej krawędzi dna (Blum TD-132/1). Dno łączy się z bokami i z tyłem/przodem
(`frontBackJoints`: wkręty od spodu dna / kołki i rowki Lamello od góry; kołki/wkręty min. 80 mm od boków i od przodu/tyłu, oś rowka Lamello 75 mm + pół rowka - cały rowek poza strefą 75 mm
ze względu na sprzęgła i zaczepy MOVENTO pod dnem). Sprzęgła T51.7601 tylko jako
uwaga — Blum podaje je szablonem T65.1000.02, bez wymiarów. Rysunki: `render/drawerBoxDrawing2d.js`
(formatki z otworami + `assemblySVG`: montaż w izometrii, rozstrzelony i złożony, własny rzut w SVG
bez Three.js, żeby się drukował; `assemblyStepsHtml` — kolejność montażu wg sposobu łączenia),
okno `ui/drawerBoxDrawings.js`, sekcja huba „Skrzynki szuflad”. Rysunki formatek jednej skrzynki są w jednej
skali (`drawingScale`: 1:4 / 1:5 / 1:10 / 1:20, żeby zmieściły się na A4; wymiary SVG w mm), nie rozciągane do karty.
Przy każdej skrzynce „Gdzie w szafce”: `box.locations` (szafki + id frontów) i `cabinetFrontView` (obrys i fronty
szafki od frontu, też skos) rysowane przez `cabinetLocatorSVG` z podświetlonymi, ponumerowanymi szufladami.

## Instrukcje montażu szafek

**Instrukcje montażu szafek**: `engine/cabinetDrillings.js` (czyste, z testami) — formatki korpusu zwykłej szafki
(boki, przegrody, wieńce/trawersy, półki, plecy) z otworami per formatka, z tych samych danych co rysunek boku 2D
(`calculateModuleParts(mod)` w `engine/cabinet.js` — to samo co `calculateParts()`, ale dla dowolnej szafki: mountingData
łączników korpusu, prowadnic, zawiasów, przegród + półki z `mod.elements`). Rysunki `render/cabinetDrawing2d.js`
(formatki w jednej skali, pionowo i wymiarowane jak bok na rysunku 2D — kolumny `dimText` „DÓŁ/GÓRA (druga)”,
[Rc], rozstaw oś-oś półek, wieniec „… mm od lewej”; bez numerów otworów i bez tabeli otworów, rozmiary otworów
w legendzie; montaż w izometrii, kolejność kroków, „Gdzie w projekcie” z `computeWallLayouts`),
okno `ui/cabinetInstructions.js`, sekcja huba „Instrukcje montażu”. Wspólne klocki rysunków instrukcji (otwory, rowki,
wymiary, izometria, widok szafki od frontu) są w `render/workshopDrawing.js`, style okien w `WORKSHOP_CSS`
(`ui/drawerBoxDrawings.js`) — skrzynki szuflad i szafki wyglądają tak samo.

Szafka narożna: `engine/cornerDrillings.js` (czyste, z testami; `getCornerPanels` w tym samym formacie co
`getCabinetPanels`) — boki ramion (łączniki wieńców z `jointSetsFor`, jak w zwykłej szafce — ten sam rozstaw ma rysunek
2D narożnika), listwa narożna (podpórki, kołki w czołach pod kołki w licu wieńców), wieńce L dolny i górny (kind
`poziom-L`, `outline`, otwory w czołach `koniec-A`/`koniec-B` z `z` od przodu), półka L z wycięciem na listwę, plecy.
Rysunki `render/cornerInstructions2d.js`: `lPanelSVG` (formatka L z linią przerywaną formatki z rozkroju), montaż w
izometrii (z = legB − Z, żeby oba fronty były widoczne), `cornerStepsHtml`. Półki i przegrody w ramionach (`cornerArm`)
są tylko w tabeli formatek — ich otworów instrukcja jeszcze nie liczy. Lista okuć liczy złącza narożnika z wkrętów w
czołach wieńców L zamiast ryczałtu 8.

Szafka pod skos: `engine/slopeDrillings.js` (czyste, z testami; `getSlopePanels` zwraca `{ panels, notes }`) — otwory
z `core/slopeCabinet.js: getSlopeDrillings` (ściany boków i obu stron przegród, rzuty dna i skośnej płyty), uzupełnione
o czoła: dolne płyt stojących na dnie (kołek + wkręt), górne pod wkręty skośnej płyty, czoła półek stałych. Rozstaw
łączników z `jointSetsFor` — `getSlopeDrillings(mod, config, { jointSets })` (core/ nie importuje engine/, bez opcji
skrajne 37/69); te same zestawy dostają rysunki nawiertów skosu (`ui/slopeCutDrawings.js`). Płyty cięte pod kątem są w
instrukcji prostokątami (dłuższa krawędź, bok = strona wewnętrzna), kąty piły i krótsze krawędzie w opisie formatki.
Rysunki `render/slopeInstructions2d.js`: montaż w izometrii z wielokątów `getSlopeCabinetPolygons` (kolejność wielokątów
= kolejność formatek, patrz `slopeSolids`), `slopeStepsHtml`. Ostrzeżenia `notes` (np. brak boku na prowadnicę) na górze
karty. Lista okuć liczy złącza skosu z otworów (dno, skos, półki stałe) zamiast ryczałtu 8.

## Stół RC System

**Stół RC System** (rcsystem.pl, ręczny stół do nawiercania): `core/rcSystem.js` (czyste, z testami) — otwory bazowe
w blacie (`RC_BASES`, mm od osi wiertła) + piny +0,5…+2 (`baseAndPin`), ustawienia `project.rcSystem` (włączony, tylna
wiertarka „pin” w szynie co 16 mm albo „zderzak” 37 mm, kalibracja: głębokość boku + tylny otwór od tyłu) i
`rcRearScrew` — położenie tylnego wkrętu; gdy pewne (zderzak / pin po kalibracji), `jointSetsFor` w `carcaseParts.js`
przesuwa tylny zestaw łączników wszędzie (rysunek 2D, instrukcje, okucia). `rcPanelSetups` grupuje otwory boku wg
ustawienia (krawędź do pinów + otwór bazowy, pozycje wzdłuż, pary co 32 mm = jedno wiercenie) — karta „Wiercenie na
stole RC System” w instrukcji szafki, ustawienia w hubie „Instrukcje montażu”. Łączniki wieńców / półek stałych liczą
się od głębokości połączenia `jointDepthOf` (głębokość wieńca), tylny rząd podpórek 37 mm od tyłu boku.

## DXF frontów na CNC

**DXF frontów na CNC**: `engine/frontsDxf.js` (czysta, z testami) — wszystkie formatki kategorii
„Front” (też boki dokładane i blendy) ułożone przez `nestPartsFree` (MaxRects, bez cięć na wylot — CNC tego nie potrzebuje) na arkuszach, osobno dla każdego
materiału frontu, zapis DXF R12 (warstwy `ARKUSZ`, `FRONTY_KONTUR`, `OPISY`; teksty bez polskich
znaków). Fronty szafki pod skos niosą prawdziwy obrys w polu `outline` (`getSlopeFrontParts`),
reszta to prostokąty. Dwa jednakowe trójkąty prostokątne (blendy skosu) `pairTriangles` składa przeciwprostokątnymi w jeden prostokąt (drugi obrócony o 180°, odstęp mierzony prostopadle). Karta pod planem rozkroju: `ui/frontsDxfPanel.js` (rozmiar arkusza z
`project.cutPlan`, odstęp/obrzeże w `project.frontsDxf`).
