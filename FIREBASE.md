# Firebase — konfiguracja bezpieczeństwa

Aplikacja korzysta z Firestore do zapisu projektów w chmurze. Dostęp jest
ograniczony do listy kont Google (wszystkie widzą te same projekty).

- Kod klienta: `src/core/storage.js` (lista `ALLOWED_EMAILS`).
- Reguły bazy: `firestore.rules` (te same adresy e-mail — muszą się zgadzać).

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

## Dodanie / usunięcie konta

Zmień adresy w **dwóch** miejscach i opublikuj reguły ponownie:

1. `src/core/storage.js` → `ALLOWED_EMAILS`
2. `firestore.rules` → lista w `isOwner()`

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
