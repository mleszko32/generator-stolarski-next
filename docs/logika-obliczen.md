# Jak aplikacja liczy — logika obliczeń w pigułce

Przystępne podsumowanie tego, **co i według jakich wzorów** liczy Generator Stolarski Next.
Wszystkie wymiary w mm. Oznaczenia: **W × H × D** — szerokość × wysokość × głębokość szafki,
**th** — grubość płyty (domyślnie 18), **tp** — grubość pleców (domyślnie 3).
Szczegóły techniczne (pliki, stałe z kart producentów): [szczegoly-funkcji.md](szczegoly-funkcji.md)
i [CLAUDE.md](../CLAUDE.md).

---

## 1. Kolejność liczenia (cały przepływ)

```
Projekt (szafki, ustawienia)
   │
   ▼
1. Układ frontów           core/layout.js        → x, y, szer., wys. każdego frontu
   │
   ├─► 2. Formatki korpusu      engine/carcaseParts.js  (boki, wieńce, plecy, półki)
   ├─► 3. Formatki szuflad      core/drawerSpec.js + drawerMath.js
   ├─► 4. Wiercenia             łączniki, zawiasy, prowadnice, półki
   │
   ▼
5. Lista formatek projektu (sumowanie jednakowych, cokoły, blaty)   engine/cabinet.js
   │
   ├─► 6. Okleina (mb)          engine/edgeBanding.js
   ├─► 7. Lista okuć            engine/hardware.js
   ├─► 8. Plan rozkroju         engine/nesting.js
   │
   ▼
9. Kosztorys                engine/cost.js
```

Zasada: **wymiary frontów liczy tylko krok 1** — wszystko dalej czyta jego wynik.

---

## 2. Ustawienia: projekt vs szafka

Każda szafka bierze ustawienia projektu i nadpisuje je swoimi (`{ ...projekt, ...szafka }`) —
dotyczy frontu, konstrukcji, pleców, zawiasów.

| Ustawienie | Domyślnie |
|---|---|
| Płyta / plecy | 18 / 3 mm |
| Szczelina między frontami (`gap`) | 3 mm |
| Luzy frontu od krawędzi korpusu | boki 1,5 · góra 5 · dół 0 |
| Odsunięcie frontu od korpusu (`bodyGap`) | 2 mm |
| Szafka dolna | 600 × 720 × 513, nóżki 100, cokół cofnięty 40 |
| Szafka wisząca | 600 × 720 × 320, wisi na 1450 |
| Słupek | 600 × 2070 × 513 |
| Rozstaw łączników korpusu (maks.) | 250 mm |
| Zawiasy | 100 od dołu, 100 od góry, margines od półek 40 |

---

## 3. Korpus (zwykła szafka)

**Głębokość wieńców / półek** („głębokość wewnętrzna”):
- plecy nakładane: `D − tp`
- plecy w nucie: `D − cofnięcie_nutu − tp`

| Formatka | Długość | Szerokość | Szt. |
|---|---|---|---|
| Bok (boki przelotowe) | `H` | `D − tp` (w nucie: `D`) | 2 |
| Bok (wieńce przelotowe) | `H − 2·th` | j.w. | 2 |
| Wieniec `W###` (boki przelotowe) | `W − 2·th` | głęb. wewn. | 2 (albo 1 + trawersy) |
| Wieniec (wieńce przelotowe) | `W` | głęb. wewn. | 2 |
| Trawers górny | jak wieniec | 100 (ustawialne) | 1–2 |
| Półka stała | szerokość jej wnęki | głęb. wewn. | |
| Półka ruchoma `P###` | szerokość wnęki | głęb. wewn. **− 5** | |
| Przegroda pionowa | wysokość wnęki | głęb. wewn. | |
| Plecy nakładane (HDF) | `H − 4` | `W − 4` | 1 |
| Plecy w nucie | `H − 2·th + 2·nut − 2·luz` | `W − 2·th + 2·nut − 2·luz` | 1 |

Przy froncie **wpuszczanym** półki i przegrody są dodatkowo płytsze o `th`.
Plecy w nucie: wzór dotyczy krawędzi, na których jest nut (wszystkie / tylko boki / tylko wieńce);
krawędź bez nutu = wymiar − 4.

**Rozkład półek ruchomych „równo”**: światło = (wys. wnętrza − n·th) / (n + 1), reszta z zaokrągleń na górze.

---

## 4. Fronty (solver układu)

Każdy front ma **wnękę** (`baseZone`): lewa/prawa/dolna/górna granica, przypięta do boku korpusu,
wieńca, półki, przegrody albo innego frontu. Front powstaje z wnęki przez dodanie **nakładu**
na każdej krawędzi:

| Krawędź frontu leży przy… | Nakład (nakładany) | Nakład (wpuszczany) |
|---|---|---|
| zewnętrznej krawędzi korpusu | `th − luz` | `−luz` |
| innym froncie | `−gap` | `−gap` |
| wieńcu / półce / przegrodzie w środku | `th/2 − gap/2` (pół płyty minus pół szczeliny) | to samo |

`szer. frontu = szer. wnęki + nakład_L + nakład_P`, analogicznie wysokość.

**Podział na kilka frontów** (`distribution`, np. `1:1:1`, `2:1`, `3fr:100`):
- liczby ≤ 10 albo z `fr` = **udziały**, liczby > 10 = **stałe mm**;
- `wys. jednego udziału = (wys. całości − szczeliny między frontami − suma stałych) / suma udziałów`.
- Drzwi podwójne: `szer. skrzydła = (szer. całości − gap) / 2`.
- Szuflada wewnętrzna: wnęka minus 15 mm z boków i 5 mm z góry/dołu (ustawialne).
- Ręczne `forceH`/`forceW` i przesunięcia nadpisują wynik na końcu.

---

## 5. Szuflady

**Wnęka szuflady** = wysokość frontu minus wieniec, na który front zachodzi (dolny i/lub górny).
**Szerokość w świetle** = od granicy lewej do prawej wnęki (za przegrodą — węższa).

**Długość prowadnicy (NL)**: największa z serii producenta, która jest ≤ `głęb. wewn. − 5`
(szuflada wewn.: dodatkowo − grubość czoła − cofnięcie; front wpuszczany: − `th`).
Serie: Merivobox/Legrabox/GTV do 600, Tandembox/Antaro do 650, MOVENTO 250–750.

**Wariant wysokości** (systemy metalowe): najwyższy, którego „min. miejsce” mieści się we wnęce.

| System | Dno (szer. × dł.) | Tył (szer.) | Warianty: wys. tyłu / min. wnęka |
|---|---|---|---|
| Blum Merivobox | LW−51 × NL−26 | LW−51 | N 60,5/85,5 · M 83/108 · K 121/146 · E 184/209 |
| Blum Tandembox / Antaro | LW−75 × NL−24 | LW−87 | N 69/82,5 · M 84/98,5 · K 116/130,5 · C 167/192 · D 199/224 |
| Blum Legrabox | LW−35 × NL−10 | LW−38 | N 39/80 · M 63/106 · K 101/144 · C 148/193 · F 212/257 |
| GTV Axis Pro | LW−75 × NL−24 | LW−87 | A 84/115 · B 116/147 · C 167/198 · D 199/230 |

(LW = szerokość w świetle szafki.)

**Blum MOVENTO** (skrzynka cała z płyty):
- szer. wewn. skrzynki `LW − 42` (bok 16 mm, katalog) albo `LW − 46` (bok 18 mm, forum);
- długość `NL − 10`;
- wys. boku = wpisana albo maks.: `wnęka − 16 (pod) − 7 (nad)`, min. 60;
- tył i czoło wewn. = `bok − wcięcie dna (13/12) − grubość dna`;
- formatki: 2× bok, 1× dno (między bokami), 2× „Tył/Przód”.

**Wiercenie prowadnic** w boku: rząd na wysokości `spód wnęki + offset systemu` (Merivobox 54,
Tandembox 33, Legrabox 38, MOVENTO 38 nad wieńcem/półką); w poziomie 37 / 69 / 261 mm od frontu
(MOVENTO: 37, 69 + tylne zależnie od NL).

---

## 6. Zawiasy

**Liczba** (chyba że wymuszona): wys. drzwi ≤ 900 → 2 · do 1600 → 3 · do 2000 → 4 · powyżej → 5.

**Pozycje puszek**: pierwsza 100 od dołu, ostatnia 100 od góry, pozostałe równo pomiędzy.
Krótkie drzwi: puszki rozsunięte min. 70 mm od siebie, min. 30 mm od krawędzi.

**Omijanie kolizji**: jeśli prowadnik (±16 mm) + margines 40 mm wchodzi na półkę albo wieniec,
puszka przesuwa się co 1 mm na przemian w górę i w dół (do 400 prób). Liczą się też wieńce
szafek postawionych na sobie (drzwi przez kilka korpusów dostają zawiasy z sąsiednich modułów).
Pozycja wpisana ręcznie wyłącza automat.

---

## 7. Łączniki korpusu (kołek + wkręt)

Na każdym połączeniu wieńca / półki stałej / przegrody z bokiem, wzdłuż głębokości wieńca:
- przedni zestaw: wkręt **37** od przodu, kołek 32 dalej (69);
- tylny zestaw: wkręt **37** od tyłu wieńca, kołek 32 bliżej przodu;
- środkowe: gdy odstęp między skrajnymi > 250 mm — tyle, by żaden odstęp nie przekraczał 250,
  przyciągnięte do rastra 32 mm od przedniego wkrętu.
- Ze stołem RC System tylny i środkowe zestawy przesuwają się na piny listwy (co 16 mm).

Lista okuć liczy **faktyczną liczbę wkrętów** z tych otworów (nie ryczałt).

---

## 8. Lista formatek projektu

1. Formatki wszystkich szafek + boki dokładane + blendy (czoło + mocowanie wewn. `D − th`) + blaty.
2. **Sumowanie**: jednakowa kategoria + nazwa + wymiary + materiał = jeden wiersz z ilością.
   Nazwy szuflad nie zawierają szerokości szafki, żeby się sumowały.
3. **Cokół**: szafki dolne na nóżkach z tym samym obrotem, stykające się, z tym samym cofnięciem
   i wysokością → jeden bieg. Bieg dłuższy niż arkusz (`dłuższy bok − 2·obrzeże`, domyślnie
   2800 − 20 = 2780) dzielony na **najmniej części**, łączenia na stykach szafek, potem jak najrówniej.

---

## 9. Okleina

- Domyślnie wszystkie 4 krawędzie, oprócz Plecy i Blat (te bez).
- Można przełączać krawędzie per formatka (dotyczy wszystkich identycznych).
- `mb = Σ (krawędzie dł. × długość + krawędzie krót. × szerokość) × ilość / 1000`, na liście okuć **+10% zapasu**.

---

## 10. Okucia

| Pozycja | Jak liczona |
|---|---|
| Nóżki | 4 na szafkę (narożna 5), wysokość osobno dla każdej |
| Złącze korpusowe (kołek + konfirmat) | liczba wkrętów z wierceń wieńców/półek stałych |
| Łącznik Lamello (skos) | liczba rowków |
| Komplet szuflady | 1 na szufladę, z systemem, wariantem i NL |
| Zawias + prowadnik | liczba zawiasów z pkt 6 (szafka ślepa: zawias równoległy) |
| Okucie narożne | 1 komplet na szafkę ślepą / narożną |
| Drążek | długość z wnęki + 2 wsporniki |
| Okleina | mb z pkt 9 |

---

## 11. Rozkrój

Układanie „pasami” z cięciami na wylot (pilarka formatowa): formatki sortowane od najwyższych,
kładzione w poziomych pasach; rzaz 3 mm, obrzeże arkusza 10 mm (domyślnie arkusz 2800 × 2070).
Sprawdza kilka wariantów (orientacja arkusza, obracanie formatek) i wybiera **najmniej arkuszy**,
przy remisie — największy zwarty odpad. Fronty na CNC (DXF) układane swobodnie (MaxRects).

---

## 12. Kosztorys

```
materiały  = Σ (pow. formatek m²  × cena m² kategorii)     ← fronty wg własnego cennika materiałów
cięcie     = liczba formatek (Korpus, Front, Szuflada, Plecy) × cena za formatkę
okucia     = Σ ilość × cena
──────────────────────────────── towary (goodsSubtotal)
praca      = godz. warsztat × stawka + lakiernia + montaż + transport
──────────────────────────────── robocizna (workSubtotal)

cena przed rabatem = towary × (1 + marża%) + robocizna × (1 + marża na pracę%)
netto              = cena przed rabatem × (1 − rabat%)
brutto             = netto × (1 + VAT%)
```

Uwaga: liczona jest **powierzchnia formatek**, nie arkuszy — odpad trzeba wliczyć w cenę m².

---

## 13. Przykład liczbowy — szafka dolna 600 × 720 × 513

Płyta 18, plecy 3 nakładane, boki przelotowe, ustawienia domyślne.

**Korpus**
- Bok: 720 × (513 − 3) = **720 × 510** × 2
- Wieniec W600: (600 − 36) × 510 = **564 × 510** × 2
- Plecy: **716 × 596**
- Półka ruchoma: **564 × 505**

**Jedne drzwi na całą wnękę** (wnęka X 18…582, Y 18…702):
- nakład boki: 18 − 1,5 = 16,5 → szer. 564 + 33 = **597**
- nakład dół: 18 − 0 = 18, góra: 18 − 5 = 13 → wys. 684 + 31 = **715**
- zawiasy: 2 szt. (715 ≤ 900) na 100 i 615 mm od dołu drzwi.

**Łączniki** (głęb. wieńca 510): wkręty na 37, 261, 473 mm od przodu → 3 zestawy na połączenie
(tył−przód = 436 > 250 → 1 środkowy, 37 + 224 = 261 w rastrze 32).

**Zamiast drzwi — 3 szuflady Merivobox `1:1:1`**:
- wys. frontu = (715 − 2 × 3) / 3 = **236,3**
- dolna: wnęka 236,3 − 18 = 218,3 → wariant **E** (min. 209), tył 184
- NL: 510 − 5 = 505 → **NL 500**
- dno: (564 − 51) × (500 − 26) = **513 × 474**, tył **513 × 184**
