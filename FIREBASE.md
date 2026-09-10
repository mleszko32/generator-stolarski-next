# Firebase — konfiguracja bezpieczeństwa

Aplikacja korzysta z Firestore do zapisu projektów w chmurze. Dostęp jest
ograniczony do jednego konta (właściciel), logowanie przez Google.

- Kod klienta: `src/core/storage.js` (stała `OWNER_EMAIL`).
- Reguły bazy: `firestore.rules` (ten sam adres e-mail — musi się zgadzać).

## Jednorazowa konfiguracja w konsoli Firebase

Projekt: **generator-stolarski-next** → https://console.firebase.google.com

### 1. Włącz logowanie Google

Authentication → **Sign-in method** → Add new provider → **Google** → Enable →
ustaw „Project support email" → Save.

### 2. Opublikuj reguły Firestore

Firestore Database → zakładka **Rules** → wklej całą zawartość `firestore.rules`
z repo → **Publish**.

Od tej chwili niezalogowany użytkownik (ani zalogowany innym kontem) nie odczyta
ani nie zmieni żadnego projektu. Istniejące projekty w kolekcji `projects/`
zostają na miejscu i stają się dostępne po zalogowaniu właściciela.

### 3. Autoryzowane domeny

Authentication → **Settings** → Authorized domains. `localhost` jest domyślnie.
Dodaj domenę produkcyjną (np. `*.vercel.app` albo własną).

## Zmiana konta właściciela

Podmień adres w **dwóch** miejscach i opublikuj reguły ponownie:

1. `src/core/storage.js` → `OWNER_EMAIL`
2. `firestore.rules` → warunek w `isOwner()`

Alternatywnie w regułach można użyć UID zamiast e-maila (patrz komentarz w
`firestore.rules`). UID: Authentication → Users.

## Wdrożenie reguł z linii poleceń (opcjonalnie)

Zamiast wklejać w konsoli:

```
npm i -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project generator-stolarski-next
```

`firebase.json` w repo wskazuje już na `firestore.rules`.
