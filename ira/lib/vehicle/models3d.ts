// Real 3D car models (Sketchfab embeds) for the "Your car" stage and the home
// page. Cars are matched by make and model only, so one model covers every model
// year. Cars not listed here get no stage. See docs/3d-car-models.md.
import carModels from "./carModels.json";

export interface CarModel {
  label: string;      // shown under the car name, e.g. "Midsize sedan"
  sketchfab: string;  // Sketchfab model link, embed code or 32-character id
  zoom?: number;      // camera distance after framing (1 = whole car, smaller = closer)
  credit: string;     // attribution the model's license requires (shown in the footer)
  creditUrl: string;
}

const MODELS: Record<string, CarModel> = carModels;

// "Toyota", "Prius Prime (PHEV)" → "toyota/prius prime"
export function modelKey(make: string, model: string): string {
  return `${make.trim().toLowerCase()}/${model.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase()}`;
}

export function sketchfabId(link: string): string | null {
  return link.match(/[0-9a-f]{32}/)?.[0] ?? null;
}

export function carModelFor(make: string, model: string): (CarModel & { uid: string }) | null {
  const entry = MODELS[modelKey(make, model)];
  const uid = entry && sketchfabId(entry.sketchfab);
  return entry && uid ? { ...entry, uid } : null;
}

// Each model once, for the credits line in the footer.
export const MODEL_CREDITS: { text: string; url: string }[] = [
  ...new Map(Object.values(MODELS).map((m) => [m.creditUrl, { text: m.credit, url: m.creditUrl }])).values(),
];
