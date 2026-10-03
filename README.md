# Generator Stolarski Next

Aplikacja przeglądarkowa do projektowania zabudów stolarskich (kuchnie, szafy) złożonych
z wielu szafek. Na podstawie projektu generuje:

- listę formatek (z okleinowaniem) i plan rozkroju płyt z etykietami,
- listę okuć (zawiasy, prowadnice, nóżki, złącza),
- rysunki 2D formatek z wierceniami do druku,
- rzuty ścian, kosztorys i ofertę dla klienta.

Szafki ustawia się w widoku 3D pomieszczenia, a ich wnętrze (półki, przegrody, drzwi,
szuflady) w edytorze 2D. Projekty zapisują się w chmurze (Firebase Firestore, logowanie
kontem Google z listy dozwolonych). Szkic odręczny można zamienić na szafki przez import AI
(Google Gemini).

## Uruchomienie

Wymaga Node.js.

```bash
npm install
npm run dev
```

| Polecenie | Co robi |
| --- | --- |
| `npm run dev` | serwer deweloperski Vite |
| `npm run build` | build produkcyjny do `dist/` |
| `npm run preview` | podgląd zbudowanego `dist/` |
| `npm test` / `npm run test:run` | testy Vitest (watch / jednorazowo) |
| `npm run lint` | ESLint |

CI (GitHub Actions) uruchamia lint, testy i build przy każdym pushu.

Import szkicu AI (`api/gemini.js`) to funkcja serverless Vercela — lokalnie działa tylko
przez `vercel dev` z ustawioną zmienną `GEMINI_API_KEY`.

## Technologie

Czyste moduły ES, Vite, Three.js, Firebase (Firestore + Auth), Zod, Vitest.

## Dokumentacja

- [CLAUDE.md](CLAUDE.md) — architektura, przepływ danych, konwencje i pułapki w kodzie.
- [FIREBASE.md](FIREBASE.md) — konfiguracja Firebase: logowanie, reguły bazy, dodawanie
  użytkowników.
