// src/render/drawingPalette.js
//
// Kolory i fonty rysunków 2D (rysunki boków z wierceniami, formatki narożnika, rzuty
// ścian). Rysunki to samodzielne SVG - otwierane w osobnym oknie, drukowane i
// zapisywane - więc nie mogą korzystać z tokenów CSS aplikacji (styles/global.css);
// dlatego kolory są tu jako zwykłe wartości hex, ale w jednym miejscu. Nazwy jak w
// palecie Tailwinda (z niej pochodzą); znaczenie koloru (np. fioletowy = łączenia,
// pomarańczowy = podpórki półek, zielony = zawiasy, niebieski = prowadnice) wynika z
// legend na rysunkach.
export const C = {
  white: '#ffffff',
  cupFill: '#fcfdfd', // wnętrze puszki zawiasu (prawie biel, odróżnia się od panelu)

  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',
  gray200: '#e5e7eb',
  gray500: '#6b7280',
  stone200: '#e7e5e4',
  stone500: '#78716c',

  red100: '#fee2e2',
  red600: '#dc2626',
  red700: '#b91c1c',
  red800: '#991b1b',
  orange50: '#fff7ed',
  orange600: '#ea580c',
  orange700: '#c2410c',
  orange800: '#9a3412',
  amber100: '#fef3c7',
  amber600: '#d97706',
  amber700: '#b45309',
  green50: '#f0fdf4',
  green200: '#bbf7d0',
  green500: '#22c55e',
  green600: '#16a34a',
  green700: '#15803d',
  emerald200: '#a7f3d0',
  emerald600: '#059669',
  teal700: '#0f766e',
  sky100: '#e0f2fe',
  sky200: '#bae6fd',
  sky600: '#0284c7',
  blue50: '#eff6ff',
  blue100: '#dbeafe',
  blue500: '#3b82f6',
  blue600: '#2563eb',
  blue700: '#1d4ed8',
  blue900: '#1e3a8a',
  violet600: '#7c3aed',
  purple600: '#9333ea',

  wood: '#d6b48a', // blat w rzucie ściany; w schemacie blatów - blat przy ścianie tylnej
  worktopFront: '#c9d6a3', // schemat blatów (hub): blat przy ścianie przedniej
  worktopLeft: '#a9c7d9', // ... lewej
  worktopRight: '#d9a9c2', // ... prawej
  woodDark: '#7c5a34',
};

export const FONT = 'sans-serif';
export const FONT_UI = "'Segoe UI', sans-serif";
