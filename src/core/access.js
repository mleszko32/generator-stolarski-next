// src/core/access.js
//
// Konta z dostępem do chmury i do importu szkicu AI - jedno źródło dla klienta
// (core/storage.js) i funkcji serwerowej (api/gemini.js). TE SAME adresy muszą być
// w firestore.rules (isOwner) - tam jest właściwe zabezpieczenie Firestore.
// Bez zależności, żeby funkcja Vercela mogła to zaimportować.
export const FIREBASE_PROJECT_ID = "generator-stolarski-next";

export const ALLOWED_EMAILS = ["mleszko32@gmail.com", "mebleleszko@gmail.com"];

export const isAllowedEmail = (email) => !!email && ALLOWED_EMAILS.includes(String(email).toLowerCase());
