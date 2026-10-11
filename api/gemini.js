// api/gemini.js
//
// Import odręcznego szkicu: obraz -> Gemini -> tablica modułów szafek. Tylko dla kont z
// core/access.js (token ID Firebase w nagłówku Authorization), bo każde zapytanie idzie na
// koszt klucza GEMINI_API_KEY.
import { verifyFirebaseIdToken } from "./_lib/firebaseToken.js";
import { validateSketchRequest, extractModules } from "./_lib/sketch.js";
import { FIREBASE_PROJECT_ID, isAllowedEmail } from "../src/core/access.js";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";
const TIMEOUT_MS = 55_000;

const promptText = `
    Jesteś wybitnym ekspertem stolarstwa i CAD. Przeanalizuj szkic mebli od LEWEJ do PRAWEJ.
    Zwróć WYŁĄCZNIE tablicę JSON, gdzie każdy obiekt to osobny moduł szafki.
    Podziel każdy moduł na pionowe strefy (od DOŁU do GÓRY).

    BARDZO WAŻNE: Jeśli szafka zawiera blok szuflad jedna pod drugą, ZGRUPUJ je jako jedną strefę (section) z typem "szuflady" i ustaw "count" na łączną liczbę tych szuflad! Nigdy nie rób osobnej strefy dla każdej pojedynczej szuflady!

    Wymagany format wyjściowy (sam czysty JSON z klamrą '['):
    [
      {
        "name": "Szafka dolna szuflady",
        "type": "base_cabinet",
        "width": 800,
        "height": 768,
        "sections": [
          { "type": "szuflady", "count": 3, "height": 768 }
        ]
      },
      {
        "name": "Lewy słupek",
        "type": "tall_cabinet",
        "width": 600,
        "height": 2303,
        "sections": [
          { "type": "drzwi", "count": 1, "height": 768 },
          { "type": "wneka_otwarta", "count": 0, "height": 384 },
          { "type": "drzwi", "count": 1, "height": 768 }
        ]
      }
    ]
`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Dozwolone tylko zapytania POST.' });
    }

    // Serwer Vercel bezpiecznie pobiera klucz ze zmiennych środowiskowych.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Błąd konfiguracji serwera: Brak klucza API.' });
    }

    // Tylko zalogowane konta z listy dozwolonych.
    const authHeader = String(req.headers?.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    try {
        const user = await verifyFirebaseIdToken(token, { projectId: FIREBASE_PROJECT_ID });
        if (!isAllowedEmail(user.email)) return res.status(403).json({ error: 'To konto nie ma dostępu do importu szkicu.' });
    } catch (err) {
        return res.status(401).json({ error: `Zaloguj się, aby użyć importu szkicu (${err.message})` });
    }

    const v = validateSketchRequest(req.body);
    if (!v.ok) return res.status(v.status).json({ error: v.error });

    const payload = {
        contents: [{ parts: [
            { text: promptText },
            { inline_data: { mime_type: v.mimeType, data: v.base64Image } }
        ]}],
        generationConfig: { responseMimeType: "application/json" },
    };

    try {
        const response = await fetch(GEMINI_URL, {
            method: "POST",
            // Klucz w nagłówku, nie w adresie (adresy trafiają do logów).
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || data.error) {
            console.error('Gemini:', response.status, data?.error?.message);
            return res.status(502).json({ error: `Usługa AI odpowiedziała błędem (${response.status}). Spróbuj ponownie.` });
        }
        return res.status(200).json({ modules: extractModules(data) });
    } catch (err) {
        const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
        console.error('Gemini:', err);
        return res.status(timeout ? 504 : 502).json({ error: timeout ? 'Usługa AI nie odpowiedziała na czas.' : err.message });
    }
}
