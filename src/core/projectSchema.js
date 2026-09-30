// src/core/projectSchema.js
//
// Walidacja kształtu projektu wczytywanego z chmury (Firestore), historii
// wersji albo kopii lokalnej (localStorage) - PRZED przypisaniem do
// state.project (core/storage.js: applyProjectData). Bez tego uszkodzony
// albo ręcznie edytowany plik JSON wywalał się dopiero głęboko w
// recalculateLayout()/update3D(), z niejasnym błędem w konsoli.
//
// Celowo NIE jest to pełny, sztywny opis każdego pola modułu/frontu - fronty
// mają zupełnie różne kształty zależnie od typ/subtype (drzwi, szuflada,
// narożnik...), a próba opisania tego wszystkiego groziłaby odrzuceniem
// poprawnego, starszego projektu przez zbyt surową walidację. Sprawdzamy
// tylko te pola, których brak/zły typ REALNIE wywala renderer (mod.id,
// mod.type, mod.dimensions, mod.position, mod.elements jako tablica) -
// wszystko inne przechodzi przez .passthrough() bez zmian, drobne
// niezgodności (np. position.x jako string) są po cichu naprawiane
// (.catch()) zamiast blokować wczytanie całego projektu.
import { z } from "zod";

const num = () => z.number().catch(0);

const Vec3Schema = z
  .object({ x: num(), y: num(), z: num() })
  .passthrough()
  .catch({ x: 0, y: 0, z: 0 });

const ElementSchema = z.record(z.string(), z.any());

const ModuleSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    dimensions: z.record(z.string(), z.any()).catch({}),
    position: Vec3Schema,
    elements: z.array(ElementSchema).catch([]),
  })
  .passthrough();

const SidePanelSchema = z.object({ id: z.string() }).passthrough();

// `.catch([])` na CAŁEJ tablicy modułów byłoby niebezpieczne - jeden zepsuty
// moduł w środku 10 dobrych ubiłby WSZYSTKIE 10 po cichu (cała tablica ląduje
// w catch). Zamiast tego: brak pola / zła wartość NIEBĘDĄCA tablicą -> pusta
// tablica (nic nie tracimy, bo nie było tam żadnych modułów do odzyskania);
// ale jeśli to JEST tablica, każdy element musi przejść walidację NAPRAWDĘ -
// pojedynczy uszkodzony moduł zgłasza się jako czytelny błąd zamiast po cichu
// znikać razem z resztą.
const asArrayOrEmpty = (v) => (Array.isArray(v) ? v : []);

export const ProjectSchema = z
  .object({
    modules: z.preprocess(asArrayOrEmpty, z.array(ModuleSchema)),
    sidePanels: z.preprocess(asArrayOrEmpty, z.array(SidePanelSchema)),
  })
  .passthrough();

// Zwraca { success: true, data } albo { success: false, issues: string[] }.
// `data` po sukcesie to TEN SAM projekt, tylko z uzupełnionymi/naprawionymi
// drobnymi brakami (patrz .catch() wyżej) - nic poza tym nie jest usuwane
// (.passthrough() na każdym poziomie).
export function validateProjectData(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { success: false, issues: ["Dane projektu nie są obiektem (uszkodzony zapis?)."] };
  }
  const result = ProjectSchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  const issues = result.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.length ? i.path.join(".") : "(korzeń)"}: ${i.message}`);
  return { success: false, issues };
}
