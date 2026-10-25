// Library of 3D car specs for the "Your car" stage. Each Toyota gets real-world
// dimensions (meters) and a body style; components/car/buildCar.ts turns a spec
// into geometry. Real models are listed in public/cars/models.json (see
// docs/3d-car-models.md) and replace the generated car once they load.

export type BodyStyle = "sedan" | "hatch" | "liftback" | "crossSedan" | "coupe" | "suv" | "boxySuv" | "van" | "truck";

export interface CarSpec {
  label: string;      // shown under the car name, e.g. "Midsize sedan"
  body: BodyStyle;
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  wheelRadius: number;
  paint: string;      // hex
  glb?: string;       // path under /public, e.g. "/cars/toyota/camry.glb"
  sketchfab?: string; // Sketchfab model id, shown in Sketchfab's embedded viewer instead
  embedZoom?: number; // Sketchfab camera distance after framing (1 = whole car, smaller = closer)
  rotateY?: number;   // degrees to turn the .glb so its nose points the right way
  credit?: { text: string; url?: string }; // attribution the model's license requires
}

// One entry in public/cars/models.json, keyed by modelKey().
export interface ModelFile {
  file?: string;      // a .glb under /public
  sketchfab?: string; // or a Sketchfab model link / embed code / id
  zoom?: number;      // Sketchfab only: camera distance after framing, default 0.8
  rotateY?: number;
  credit?: string;
  creditUrl?: string;
}

// "Toyota", "Prius Prime (PHEV)" → "toyota/prius prime"
export function modelKey(make: string, model: string): string {
  return `${make.trim().toLowerCase()}/${model.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase()}`;
}

export function withModelFile(spec: CarSpec, entry: ModelFile | undefined): CarSpec {
  if (!entry) return spec;
  const sketchfab = entry.sketchfab?.match(/[0-9a-f]{32}/)?.[0];
  return { ...spec, glb: entry.file, sketchfab, embedZoom: entry.zoom, rotateY: entry.rotateY, credit: entry.credit ? { text: entry.credit, url: entry.creditUrl } : undefined };
}

// Profile proportions per body style. Heights are fractions of overall height,
// x positions are fractions of length measured from the rear bumper.
export interface StyleProfile {
  clear: number;   // ground clearance (m)
  belt: number;    // beltline / top of body sides
  nose: number;    // top of front bumper / hood leading edge
  tail: number;    // rear deck height
  wsBase: number;  // windshield base x
  wsTop: number;   // windshield top (roof front) x
  roofRear: number; // roof rear x
  cBase: number;   // rear glass base x (cab back on trucks)
}

export const STYLE_PROFILES: Record<BodyStyle, StyleProfile> = {
  sedan:      { clear: 0.14, belt: 0.64, nose: 0.54, tail: 0.67, wsBase: 0.67, wsTop: 0.51, roofRear: 0.30, cBase: 0.17 },
  hatch:      { clear: 0.14, belt: 0.62, nose: 0.53, tail: 0.66, wsBase: 0.69, wsTop: 0.53, roofRear: 0.12, cBase: 0.04 },
  liftback:   { clear: 0.13, belt: 0.60, nose: 0.46, tail: 0.64, wsBase: 0.73, wsTop: 0.52, roofRear: 0.32, cBase: 0.04 },
  crossSedan: { clear: 0.17, belt: 0.62, nose: 0.53, tail: 0.65, wsBase: 0.67, wsTop: 0.51, roofRear: 0.28, cBase: 0.13 },
  coupe:      { clear: 0.11, belt: 0.60, nose: 0.44, tail: 0.63, wsBase: 0.60, wsTop: 0.44, roofRear: 0.30, cBase: 0.15 },
  suv:        { clear: 0.20, belt: 0.60, nose: 0.55, tail: 0.63, wsBase: 0.72, wsTop: 0.61, roofRear: 0.06, cBase: 0.03 },
  boxySuv:    { clear: 0.24, belt: 0.60, nose: 0.60, tail: 0.62, wsBase: 0.72, wsTop: 0.65, roofRear: 0.05, cBase: 0.03 },
  van:        { clear: 0.15, belt: 0.55, nose: 0.46, tail: 0.58, wsBase: 0.80, wsTop: 0.63, roofRear: 0.05, cBase: 0.03 },
  truck:      { clear: 0.25, belt: 0.62, nose: 0.60, tail: 0.62, wsBase: 0.66, wsTop: 0.56, roofRear: 0.39, cBase: 0.37 },
};

const BODY_LABEL: Record<BodyStyle, string> = {
  sedan: "Sedan", hatch: "Hatchback", liftback: "Hybrid liftback", crossSedan: "Crossover sedan", coupe: "Sports coupe",
  suv: "SUV", boxySuv: "Off-road SUV", van: "Minivan", truck: "Pickup truck",
};

const spec = (body: BodyStyle, length: number, width: number, height: number, wheelbase: number, wheelRadius: number, paint: string, label?: string): CarSpec =>
  ({ body, length, width, height, wheelbase, wheelRadius, paint, label: label ?? BODY_LABEL[body] });

// Keys are lowercased NHTSA model names (what /api/vehicle/catalog returns for Toyota).
export const TOYOTA_MODELS: Record<string, CarSpec> = {
  camry:               spec("sedan",      4.92, 1.84, 1.445, 2.825, 0.35, "#b0121b", "Midsize sedan"),
  corolla:             spec("sedan",      4.63, 1.78, 1.435, 2.700, 0.32, "#2b4c8c", "Compact sedan"),
  "corolla hatchback": spec("hatch",      4.37, 1.79, 1.460, 2.640, 0.33, "#d4501e", "Compact hatchback"),
  "corolla hybrid":    spec("sedan",      4.63, 1.78, 1.435, 2.700, 0.32, "#c9ccd1", "Compact hybrid sedan"),
  prius:               spec("liftback",   4.60, 1.78, 1.430, 2.750, 0.34, "#d6a419"),
  rav4:                spec("suv",        4.60, 1.86, 1.690, 2.690, 0.37, "#8d9188", "Compact SUV"),
  "rav4 hybrid":       spec("suv",        4.60, 1.86, 1.690, 2.690, 0.37, "#1f3b63", "Compact hybrid SUV"),
  highlander:          spec("suv",        4.95, 1.93, 1.730, 2.850, 0.38, "#5a1a1f", "Midsize 3-row SUV"),
  "highlander hybrid": spec("suv",        4.95, 1.93, 1.730, 2.850, 0.38, "#e9e9e7", "Midsize hybrid SUV"),
  "grand highlander":  spec("suv",        5.12, 1.99, 1.800, 2.950, 0.39, "#2f3236", "Large 3-row SUV"),
  "4runner":           spec("boxySuv",    4.95, 1.98, 1.850, 2.850, 0.40, "#d4561f"),
  tacoma:              spec("truck",      5.40, 1.95, 1.800, 3.300, 0.40, "#4a5a3a", "Midsize pickup"),
  tundra:              spec("truck",      5.93, 2.04, 1.980, 3.700, 0.42, "#1c1d20", "Full-size pickup"),
  sequoia:             spec("boxySuv",    5.29, 2.02, 1.890, 3.100, 0.42, "#7c8288", "Full-size SUV"),
  sienna:              spec("van",        5.18, 1.99, 1.770, 3.030, 0.36, "#2f4f6f"),
  "gr supra":          spec("coupe",      4.38, 1.85, 1.290, 2.470, 0.35, "#e6c619"),
  crown:               spec("crossSedan", 4.98, 1.84, 1.540, 2.850, 0.37, "#3b4a5a"),
  "crown signia":      spec("suv",        4.93, 1.88, 1.620, 2.850, 0.38, "#3b4a5a", "Midsize SUV"),
  "prius prime":       spec("liftback",   4.60, 1.78, 1.430, 2.750, 0.34, "#9aa3ab"),
  "prius c":           spec("hatch",      4.06, 1.70, 1.490, 2.550, 0.30, "#4f9a3c", "Subcompact hatchback"),
  "prius v":           spec("hatch",      4.62, 1.78, 1.575, 2.780, 0.32, "#6c7c8a", "Hybrid wagon"),
  "corolla cross":     spec("suv",        4.46, 1.83, 1.620, 2.640, 0.36, "#4d6b7f", "Subcompact SUV"),
  "gr corolla":        spec("hatch",      4.41, 1.85, 1.480, 2.640, 0.34, "#f2f2f0", "Hot hatch"),
  "gr86":              spec("coupe",      4.26, 1.78, 1.310, 2.575, 0.33, "#c3141e"),
  supra:               spec("coupe",      4.38, 1.85, 1.290, 2.470, 0.35, "#e6c619"),
  "86":                spec("coupe",      4.24, 1.78, 1.285, 2.570, 0.32, "#c3141e"),
  avalon:              spec("sedan",      4.98, 1.85, 1.440, 2.870, 0.35, "#2a2d33", "Full-size sedan"),
  yaris:               spec("hatch",      4.14, 1.70, 1.500, 2.510, 0.30, "#c3141e", "Subcompact"),
  "yaris ia":          spec("sedan",      4.35, 1.70, 1.480, 2.570, 0.30, "#c3141e", "Subcompact sedan"),
  echo:                spec("sedan",      4.15, 1.66, 1.500, 2.370, 0.29, "#6f8aa8", "Subcompact sedan"),
  matrix:              spec("hatch",      4.37, 1.77, 1.550, 2.600, 0.32, "#5a6470", "Compact wagon"),
  celica:              spec("coupe",      4.34, 1.74, 1.310, 2.600, 0.31, "#d7cf3c"),
  solara:              spec("coupe",      4.89, 1.82, 1.420, 2.720, 0.33, "#8a8f96", "Midsize coupe"),
  venza:               spec("suv",        4.74, 1.86, 1.660, 2.690, 0.37, "#6e5d4c", "Midsize crossover"),
  "c-hr":              spec("suv",        4.36, 1.80, 1.560, 2.640, 0.35, "#2b7fb8", "Subcompact crossover"),
  bz4x:                spec("suv",        4.69, 1.86, 1.650, 2.850, 0.37, "#d9dadb", "Electric SUV"),
  "bz":                spec("suv",        4.69, 1.86, 1.650, 2.850, 0.37, "#d9dadb", "Electric SUV"),
  mirai:               spec("sedan",      4.98, 1.89, 1.470, 2.920, 0.36, "#1d3f73", "Fuel-cell sedan"),
  "fj cruiser":        spec("boxySuv",    4.67, 1.91, 1.830, 2.690, 0.40, "#2c6fb0"),
  "land cruiser":      spec("boxySuv",    4.92, 1.98, 1.870, 2.850, 0.41, "#c9b28a", "Full-size off-roader"),
  "highlander hybrid max": spec("suv",    4.95, 1.93, 1.730, 2.850, 0.38, "#e9e9e7", "Midsize hybrid SUV"),
  t100:                spec("truck",      5.31, 1.91, 1.760, 3.090, 0.36, "#8a1b1f", "Pickup"),
  previa:              spec("van",        4.75, 1.80, 1.780, 2.860, 0.33, "#566a4d"),
  "rav4 prime":        spec("suv",        4.60, 1.86, 1.690, 2.690, 0.37, "#c3141e", "Plug-in hybrid SUV"),
  "camry solara":      spec("coupe",      4.89, 1.82, 1.420, 2.720, 0.33, "#8a8f96", "Midsize coupe"),
  "corolla matrix":    spec("hatch",      4.37, 1.77, 1.550, 2.600, 0.32, "#5a6470", "Compact wagon"),
  mr2:                 spec("coupe",      3.89, 1.70, 1.240, 2.450, 0.30, "#c3141e", "Mid-engine roadster"),
  tercel:              spec("sedan",      4.12, 1.66, 1.380, 2.380, 0.29, "#8a8f96", "Subcompact sedan"),
  paseo:               spec("coupe",      4.16, 1.66, 1.300, 2.380, 0.29, "#2a6f8a", "Subcompact coupe"),
  "scion fr-s":        spec("coupe",      4.24, 1.78, 1.285, 2.570, 0.32, "#e9e9e7"),
  "scion tc":          spec("hatch",      4.42, 1.79, 1.420, 2.700, 0.33, "#2a2d33", "Sport hatchback"),
  "scion xb":          spec("boxySuv",    4.25, 1.76, 1.640, 2.600, 0.32, "#6f8aa8", "Compact wagon"),
  "scion xa":          spec("hatch",      3.86, 1.69, 1.530, 2.370, 0.29, "#d4501e", "Subcompact hatchback"),
  "scion iq":          spec("hatch",      3.05, 1.68, 1.500, 2.000, 0.28, "#4f9a3c", "City car"),
};

// Other makes reuse a generic shape for their body style.
const GENERIC: Record<"sedan" | "suv" | "bigSuv" | "truck" | "smallTruck", CarSpec> = {
  sedan:      spec("sedan",   4.80, 1.83, 1.450, 2.800, 0.34, "#5d6670"),
  suv:        spec("suv",     4.60, 1.86, 1.680, 2.700, 0.37, "#5d6670"),
  bigSuv:     spec("suv",     5.05, 2.00, 1.780, 2.950, 0.39, "#5d6670"),
  truck:      spec("truck",   5.90, 2.03, 1.950, 3.680, 0.42, "#5d6670"),
  smallTruck: spec("truck",   5.07, 1.85, 1.750, 3.080, 0.38, "#5d6670"),
};
const OTHER: Record<string, keyof typeof GENERIC> = {
  civic: "sedan", accord: "sedan", "cr-v": "suv", "hr-v": "suv",
  "f-150": "truck", escape: "suv", explorer: "bigSuv", maverick: "smallTruck",
  silverado: "truck", equinox: "suv", malibu: "sedan", trax: "suv",
  elantra: "sedan", tucson: "suv", "santa fe": "suv", sonata: "sedan",
  altima: "sedan", rogue: "suv", sentra: "sedan", pathfinder: "bigSuv",
};

// Picks the car to draw: the Toyota library first, then known models of other
// makes, then the lookup's segment text (e.g. "full-size truck"), then a sedan.
export function carSpecFor(make: string, model: string, segment?: string): CarSpec {
  const mk = make.trim().toLowerCase();
  const md = modelKey(make, model).split("/")[1];
  if (mk === "toyota" && TOYOTA_MODELS[md]) return TOYOTA_MODELS[md];
  if (OTHER[md]) return GENERIC[OTHER[md]];
  const seg = (segment ?? "").toLowerCase();
  if (/truck|pickup/.test(seg)) return /compact|midsize|mid-size/.test(seg) ? GENERIC.smallTruck : GENERIC.truck;
  if (/van/.test(seg)) return { ...GENERIC.bigSuv, body: "van", label: "Minivan" };
  if (/suv|crossover/.test(seg)) return /full|large|3-row|three-row/.test(seg) ? GENERIC.bigSuv : GENERIC.suv;
  if (/coupe|sports|convertible|roadster/.test(seg)) return { ...GENERIC.sedan, body: "coupe", height: 1.32, label: "Coupe" };
  if (/hatch|wagon/.test(seg)) return { ...GENERIC.sedan, body: "hatch", length: 4.4, label: "Hatchback" };
  return GENERIC.sedan;
}
