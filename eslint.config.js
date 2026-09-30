// eslint.config.js
//
// Pierwszy linter w tym projekcie (patrz CLAUDE.md - dotąd "There is no
// linter"). Celowo tylko `js.configs.recommended` - łapie realne pomyłki
// (literówki w nazwach zmiennych, nieużywane importy, niebezpieczne
// porównania) bez narzucania stylu formatowania na istniejący, duży
// codebase. Nic tu nie powinno zmieniać zachowania aplikacji - to tylko
// statyczna analiza.
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Parametry funkcji nieużywane celowo (np. zgodność sygnatury callbacku)
      // są w tym kodzie częste i nieszkodliwe - łapiemy tylko zapomniane
      // zmienne LOKALNE, nie każdy nieużywany argument.
      // Parametry funkcji i `catch (e)` gdzie `e` nie jest odczytywane są w tym
      // kodzie częste i nieszkodliwe (fallback bez potrzeby szczegółu błędu) -
      // łapiemy tylko zapomniane zmienne LOKALNE.
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
      // Ten kodebase celowo używa `catch (e) {}` do wyciszania opcjonalnych,
      // niekrytycznych błędów (np. localStorage niedostępny w trybie prywatnym)
      // - to nie jest bug, tylko świadomy no-op.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["api/**/*.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
