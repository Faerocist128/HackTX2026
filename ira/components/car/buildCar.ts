import * as THREE from "three";
import { STYLE_PROFILES, type CarSpec } from "@/lib/vehicle/models3d";

// Builds a stylized car from a spec: extruded side profile for the body,
// a glass greenhouse with a painted roof cap, wheels, lights and trim.
// Origin is the center of the footprint on the ground; +x points forward.
export function buildCar(spec: CarSpec): THREE.Group {
  const p = STYLE_PROFILES[spec.body];
  const { length: L, width: W, height: H, wheelRadius: r } = spec;
  const belt = p.belt * H, nose = p.nose * H, tail = p.tail * H, clear = p.clear;
  const overhang = L - spec.wheelbase;
  const rearX = overhang * 0.55, frontX = rearX + spec.wheelbase;

  const paint = new THREE.MeshPhysicalMaterial({ color: spec.paint, metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#0c1016", metalness: 0.3, roughness: 0.06, clearcoat: 1 });
  const trim = new THREE.MeshStandardMaterial({ color: "#16181c", roughness: 0.7 });
  const tire = new THREE.MeshStandardMaterial({ color: "#121214", roughness: 0.9 });
  const rim = new THREE.MeshStandardMaterial({ color: "#c4c8ce", metalness: 0.9, roughness: 0.25 });
  const headlight = new THREE.MeshStandardMaterial({ color: "#f4f7ff", emissive: "#dfe8ff", emissiveIntensity: 0.9 });
  const taillight = new THREE.MeshStandardMaterial({ color: "#7a0610", emissive: "#e0101e", emissiveIntensity: 0.8 });

  const group = new THREE.Group();
  const bevel = 0.12;
  const roofY = H - 0.04;

  // Plan-view taper toward the bumpers, so the car isn't a slab.
  const taper = (x: number) => {
    const f = Math.min(1, Math.max(0, (x - (L - 0.75)) / 0.75));
    const b = Math.min(1, Math.max(0, (0.55 - x) / 0.55));
    return 1 - 0.13 * f * f - 0.09 * b * b;
  };
  // Body sides tuck in near the beltline; the greenhouse leans in toward the roof.
  const bodyShape = (x: number, y: number) => taper(x) * (1 - 0.06 * Math.min(1, Math.max(0, (y - (belt - 0.3)) / 0.3)));
  const cabinShape = (x: number, y: number) => taper(x) * (1 - 0.2 * Math.min(1, Math.max(0, (y - belt) / (roofY - belt))));

  // Body: side silhouette with wheel arches cut into the bottom edge.
  const body = new THREE.Shape();
  body.moveTo(0, clear + 0.14);
  body.lineTo(0.1, clear);
  for (const xw of [rearX, frontX]) {
    const R = r + 0.06;
    const t0 = Math.asin(Math.max(-1, Math.min(1, (clear - r) / R)));
    const from = Math.PI - t0, to = t0;
    for (let i = 0; i <= 16; i++) {
      const t = from + ((to - from) * i) / 16;
      body.lineTo(xw + R * Math.cos(t), r + R * Math.sin(t));
    }
  }
  body.lineTo(L - 0.12, clear);
  body.lineTo(L, clear + 0.16);
  body.lineTo(L, nose - 0.08);
  body.quadraticCurveTo(L - 0.02, nose, L - 0.14, nose + 0.01);
  body.quadraticCurveTo(p.wsBase * L + 0.4, belt - 0.01, p.wsBase * L, belt);
  body.lineTo(L * 0.1, tail);
  body.quadraticCurveTo(0, tail, 0, tail - 0.12);
  body.closePath();
  addExtrusion(group, body, W - 2 * bevel, paint, bevel, bodyShape);

  // Greenhouse (glass), slightly narrower than the body.
  const gh = new THREE.Shape();
  gh.moveTo(p.cBase * L, belt - 0.02);
  gh.lineTo(p.wsBase * L, belt - 0.02);
  gh.quadraticCurveTo((p.wsBase * 0.35 + p.wsTop * 0.65) * L, roofY - 0.02, p.wsTop * L, roofY);
  gh.quadraticCurveTo(((p.wsTop + p.roofRear) / 2) * L, roofY + 0.05, p.roofRear * L, roofY);
  gh.quadraticCurveTo((p.roofRear * 0.6 + p.cBase * 0.4) * L, roofY - 0.04, p.cBase * L, belt - 0.02);
  const ghDepth = W * 0.84;
  addExtrusion(group, gh, ghDepth, glass, 0.05, cabinShape);

  // Painted roof cap following the roofline.
  const roofPts = new THREE.QuadraticBezierCurve(
    new THREE.Vector2(p.wsTop * L, roofY), new THREE.Vector2(((p.wsTop + p.roofRear) / 2) * L, roofY + 0.05), new THREE.Vector2(p.roofRear * L, roofY),
  ).getPoints(20);
  const roof = new THREE.Shape();
  roofPts.forEach((v, i) => (i ? roof.lineTo(v.x, v.y + 0.035) : roof.moveTo(v.x, v.y + 0.035)));
  [...roofPts].reverse().forEach((v) => roof.lineTo(v.x, v.y - 0.06));
  addExtrusion(group, roof, ghDepth + 0.02, paint, 0.04, (x) => taper(x) * 0.8);

  // B-pillar to break up the side glass.
  const bx = ((p.wsTop + p.roofRear) / 2) * L - (spec.body === "truck" ? 0 : 0.15);
  box(group, [0.09, roofY - belt + 0.02, ghDepth * 0.92 + 0.08], [bx, (belt + roofY) / 2, 0], trim);

  // Truck bed opening.
  if (spec.body === "truck") box(group, [p.cBase * L - 0.32, 0.02, W - 0.36], [(p.cBase * L) / 2 + 0.08, belt + 0.005, 0], trim);

  // Lights, grille, bumpers, mirrors.
  const lz = W * 0.43 - 0.26;
  for (const z of [-lz, lz]) {
    box(group, [0.1, 0.09, 0.34], [L - 0.04, nose - 0.12, z], headlight);
    box(group, [0.1, 0.1, 0.32], [0.01, tail - 0.14, z], taillight);
    box(group, [0.16, 0.1, 0.1], [p.wsBase * L - 0.08, belt + 0.06, Math.sign(z) * (W * 0.47 + 0.06)], paint);
  }
  box(group, [0.08, Math.max(0.14, nose - clear - 0.42), W * 0.5], [L + 0.005, (nose + clear) / 2 - 0.05, 0], trim);
  box(group, [0.1, 0.12, W * 0.8], [L - 0.02, clear + 0.1, 0], trim);
  box(group, [0.1, 0.12, W * 0.84], [0.02, clear + 0.1, 0], trim);

  // Wheel-arch flares and rocker trim; chunkier cladding on SUVs and trucks.
  const rugged = spec.body === "suv" || spec.body === "boxySuv" || spec.body === "truck";
  const flare = rugged ? 0.09 : 0.035;
  const R = r + 0.06;
  const t0 = Math.asin(Math.max(-1, Math.min(1, (clear - r) / R)));
  for (const xw of [rearX, frontX]) {
    const arch = new THREE.Shape();
    arch.absarc(xw, r, R + flare, -0.15, Math.PI + 0.15, false);
    arch.absarc(xw, r, R, Math.PI - t0, t0, true);
    const geo = new THREE.ExtrudeGeometry(arch, { depth: 0.05, bevelEnabled: false, curveSegments: 24 });
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(geo, trim);
      m.position.z = side > 0 ? (W / 2) * bodyShape(xw, r) - 0.03 : -(W / 2) * bodyShape(xw, r) - 0.02;
      group.add(m);
    }
  }
  const rockerLen = frontX - rearX - 2 * (R + flare) + 0.1;
  for (const side of [-1, 1]) box(group, [rockerLen, rugged ? 0.16 : 0.07, 0.04], [(rearX + frontX) / 2, clear + (rugged ? 0.1 : 0.05), side * ((W / 2) * bodyShape((rearX + frontX) / 2, clear) - 0.005)], trim);

  // Wheels.
  const tireGeo = new THREE.CylinderGeometry(r, r, 0.26, 40);
  const rimGeo = new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.27, 24);
  const hubGeo = new THREE.CylinderGeometry(r * 0.16, r * 0.16, 0.28, 12);
  const wz = W / 2 - 0.17;
  for (const x of [rearX, frontX]) for (const z of [-wz, wz]) {
    const wheel = new THREE.Group();
    wheel.add(new THREE.Mesh(tireGeo, tire), new THREE.Mesh(rimGeo, rim), new THREE.Mesh(hubGeo, trim));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, r, z);
    wheel.traverse((o) => { o.castShadow = true; });
    group.add(wheel);
  }

  group.position.x = -L / 2;
  const root = new THREE.Group();
  root.add(group);
  return root;
}

// Extrudes a side profile across the car's width, then squeezes z by `shapeZ(x, y)`
// so panels round off toward the bumpers and roof.
function addExtrusion(group: THREE.Group, shape: THREE.Shape, depth: number, mat: THREE.Material, bevel: number, shapeZ?: (x: number, y: number) => number) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 8, curveSegments: 24 });
  geo.translate(0, 0, -depth / 2);
  if (shapeZ) {
    const pos = geo.getAttribute("position");
    // Keep the original normals: the squeeze is small, and recomputing them
    // streaks the long cap triangles.
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * shapeZ(pos.getX(i), pos.getY(i)));
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  group.add(mesh);
}

function box(group: THREE.Group, size: [number, number, number], pos: [number, number, number], mat: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  group.add(mesh);
}

// Frees every geometry, material and texture under an object.
export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
        m.dispose();
      }
    }
  });
}
