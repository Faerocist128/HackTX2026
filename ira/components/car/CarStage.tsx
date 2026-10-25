"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildCar, disposeObject } from "./buildCar";
import type { CarSpec } from "@/lib/vehicle/models3d";

interface Props { spec: CarSpec; className?: string }

interface Stage {
  spec: CarSpec | null;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  car: THREE.Object3D | null;
  appear: number; // 0→1 scale-in for the current car
}

// Interactive turntable for one car: drag to spin, auto-rotates when idle.
export default function CarStage({ spec, className }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const [dragged, setDragged] = useState(false);

  // Renderer, lights and controls live for the component's lifetime.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.touchAction = "pan-y";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    scene.environmentIntensity = 0.75;

    const sun = new THREE.DirectionalLight("#ffffff", 1.6);
    sun.position.set(4, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
    sun.shadow.radius = 6;
    scene.add(sun, new THREE.HemisphereLight("#ffffff", "#8a8f99", 0.5));

    const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.ShadowMaterial({ opacity: 0.22 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = false; // page scroll should keep scrolling the page
    controls.minPolarAngle = Math.PI * 0.28;
    controls.maxPolarAngle = Math.PI * 0.48;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 1.4;

    let idle: ReturnType<typeof setTimeout> | undefined;
    controls.addEventListener("start", () => { controls.autoRotate = false; clearTimeout(idle); setDragged(true); });
    controls.addEventListener("end", () => { idle = setTimeout(() => { controls.autoRotate = !reduceMotion; }, 2500); });

    stage.current = { spec: null, scene, camera, controls, car: null, appear: 1 };

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      if (stage.current?.spec) fit(stage.current, false);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Only render while the stage is on screen.
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = stage.current;
      if (!visible || !s) return;
      if (s.car && s.appear < 1) {
        s.appear = Math.min(1, s.appear + 0.06);
        const k = 1 - Math.pow(1 - s.appear, 3);
        s.car.scale.setScalar(0.85 + 0.15 * k);
      }
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(idle);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      if (stage.current?.car) disposeObject(stage.current.car);
      disposeObject(ground);
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      stage.current = null;
    };
  }, []);

  // Swap the car whenever the spec changes.
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    let cancelled = false;
    const place = (car: THREE.Object3D) => {
      if (cancelled) { disposeObject(car); return; }
      if (s.car) { s.scene.remove(s.car); disposeObject(s.car); }
      s.car = car;
      s.appear = 0;
      car.scale.setScalar(0.85);
      s.scene.add(car);
    };
    s.spec = spec;
    place(buildCar(spec));
    fit(s, true);

    if (spec.glb) {
      new GLTFLoader().load(spec.glb, (gltf) => {
        const model = gltf.scene;
        // Normalize: scale to the spec's length, center on the footprint, sit on the ground.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        model.scale.setScalar(spec.length / Math.max(size.x, size.z));
        box.setFromObject(model);
        const c = box.getCenter(new THREE.Vector3());
        model.position.set(-c.x, -box.min.y, -c.z);
        model.traverse((o) => { o.castShadow = true; });
        const root = new THREE.Group();
        root.add(model);
        place(root);
      }, undefined, () => { /* keep the generated car if the file is missing */ });
    }
    return () => { cancelled = true; };
  }, [spec]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={host} className="absolute inset-0 cursor-grab active:cursor-grabbing" role="img" aria-label={`3D model of a ${spec.label.toLowerCase()}. Drag to spin.`} />
      <div className={`pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 hint flex items-center gap-1.5 rounded-full px-3 py-1 transition-opacity duration-500 ${dragged ? "opacity-0" : "opacity-100"}`} style={{ background: "var(--card)", boxShadow: "var(--shadow)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M3 12a9 4 0 0 0 18 0" /><path d="M18 9l3 3-3 3" /></svg>
        Drag to spin
      </div>
    </div>
  );
}

// Back the camera off until the spinning car fits both the stage's width and
// height. `reset` returns to the front three-quarter view; otherwise keep the angle.
function fit(s: Stage, reset: boolean) {
  const spec = s.spec!;
  const { camera, controls } = s;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const radius = spec.length * 0.55; // swept radius while it turns, plus margin
  const dist = Math.max(radius / Math.tan(hfov / 2), (spec.height * 1.1) / Math.tan(vfov / 2), 6.5) * 1.05;
  const dir = reset ? new THREE.Vector3(0.78, 0.32, 0.92) : camera.position.clone().sub(controls.target);
  controls.target.set(0, spec.height * 0.55, 0); // aim high so the car sits below the title
  camera.position.copy(dir.normalize().multiplyScalar(dist)).add(controls.target);
  controls.update();
}
