"use client";
import { useEffect, useRef, useState } from "react";
import CarStage from "./CarStage";
import type { CarSpec } from "@/lib/vehicle/models3d";

// Sketchfab's Viewer API (https://sketchfab.com/developers/viewer). It tells us
// when the model has actually finished loading and lets us move the camera.
const API_SRC = "https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js";

// Viewer options: start and spin right away, keep the wheel scrolling the page,
// and hide the extra buttons (Sketchfab ignores the ones a free plan can't hide).
const OPTIONS = {
  autostart: 1, preload: 1, autospin: 0.25, scrollwheel: 0, transparent: 1, dnt: 1,
  ui_theme: "dark", ui_hint: 0, ui_help: 0, ui_settings: 0, ui_vr: 0, ui_ar: 0,
  ui_fullscreen: 0, ui_annotations: 0, ui_inspector: 0, ui_stop: 0, ui_loading: 0, ui_infos: 0,
};
const ZOOM = 0.8; // after recentering, keep this fraction of the camera distance
const INTRO_MS = 1500; // Sketchfab's camera intro after "viewerready"
// Some authors bake a dark vignette into their scene; fade the viewer's edges
// into our stage so it doesn't sit there as a dark box.
const EDGE_FADE = "radial-gradient(ellipse 62% 72% at 50% 50%, #000 62%, transparent 100%)";

type Vec3 = [number, number, number];
interface ViewerApi {
  start(): void;
  addEventListener(event: "viewerready", cb: () => void): void;
  getCameraLookAt(cb: (err: unknown, cam: { position: Vec3; target: Vec3 }) => void): void;
  setCameraLookAt(position: Vec3, target: Vec3, duration: number): void;
  recenterCamera?(cb: () => void): void;
}
interface SketchfabClient {
  init(uid: string, opts: Record<string, unknown> & { success(api: ViewerApi): void; error(): void }): void;
}
declare global { interface Window { Sketchfab?: new (iframe: HTMLIFrameElement) => SketchfabClient } }

let apiScript: Promise<void> | null = null;
function loadApi(): Promise<void> {
  apiScript ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = API_SRC;
    s.onload = () => resolve();
    s.onerror = () => { apiScript = null; reject(new Error("Sketchfab API failed to load")); };
    document.head.appendChild(s);
  });
  return apiScript;
}

// Shows a Sketchfab model in its embedded viewer. The generated car stays up
// until the model is ready, and remains if Sketchfab can't be reached.
export default function SketchfabStage({ spec, className }: { spec: CarSpec; className?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState<string | null>(null);
  const uid = spec.sketchfab!;

  useEffect(() => {
    let live = true;
    loadApi().then(() => {
      if (!live || !frame.current || !window.Sketchfab) return;
      new window.Sketchfab(frame.current).init(uid, {
        ...OPTIONS,
        success(api) {
          api.start();
          api.addEventListener("viewerready", () => {
            // Each author leaves the camera somewhere different, so frame the whole
            // car first, then move in a little. Wait out Sketchfab's intro camera
            // move first, or it overrides ours.
            const zoom = spec.embedZoom ?? ZOOM;
            const frameCar = () => api.getCameraLookAt((err, cam) => {
              if (!err) {
                const pos = cam.position.map((p, i) => cam.target[i] + (p - cam.target[i]) * zoom) as Vec3;
                api.setCameraLookAt(pos, cam.target, 0);
              }
              if (live) setTimeout(() => setReady(uid), 150);
            });
            setTimeout(() => (api.recenterCamera ? api.recenterCamera(frameCar) : frameCar()), INTRO_MS);
          });
        },
        error() { /* keep the generated car */ },
      });
    }).catch(() => { /* keep the generated car */ });
    return () => { live = false; };
  }, [uid, spec.embedZoom]);

  const shown = ready === uid;
  return (
    <div className={`relative ${className ?? ""}`}>
      {!shown && <div className="absolute inset-0"><CarStage spec={{ ...spec, glb: undefined }} className="h-full" /></div>}
      <iframe
        key={uid}
        ref={frame}
        title={`3D model of a ${spec.label.toLowerCase()}`}
        allow="autoplay; fullscreen; xr-spatial-tracking"
        className={`absolute inset-0 w-full h-full border-0 transition-opacity duration-700 ${shown ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}
      />
      {spec.credit && (
        <div className="absolute top-3 right-4 z-20 max-w-[40%] truncate text-[11px]" style={{ color: "rgba(255,255,255,0.75)" }}>
          {spec.credit.url ? <a href={spec.credit.url} target="_blank" rel="noreferrer" className="underline" style={{ color: "inherit" }}>{spec.credit.text}</a> : spec.credit.text}, via Sketchfab
        </div>
      )}
    </div>
  );
}
