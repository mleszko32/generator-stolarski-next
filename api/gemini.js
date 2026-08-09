// api/gemini.js
export default async function handler(req, res) {
    // Zabezpieczenie przed niewłaściwymi zapytaniami
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Dozwolone tylko zapytania POST.' });
    }

    const { base64Image, mimeType } = req.body;
    
    // Serwer Vercel bezpiecznie pobiera Twój klucz ze zmiennych środowiskowych
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Błąd konfiguracji serwera: Brak klucza API.' });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

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

    const payload = {
        contents: [{ parts: [
            { text: promptText }, 
            { inline_data: { mime_type: mimeType, data: base64Image } }
        ]}]
    };

    try {
        const response = await fetch(apiUrl, { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify(payload) 
        });
        const data = await response.json();
        
        if (data.error) throw new Error(data.error.message);
        
        // Zwracamy odpowiedź z powrotem do frontendowej przeglądarki użytkownika
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}