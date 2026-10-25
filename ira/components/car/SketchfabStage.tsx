"use client";
import { useEffect, useRef, useState } from "react";

// Sketchfab's Viewer API (https://sketchfab.com/developers/viewer). It tells us
// when the model has actually finished loading and lets us set the camera and
// background.
const API_SRC = "https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js";

// Viewer options: start and spin right away, keep the wheel scrolling the page,
// and hide every button and label Sketchfab lets us hide. The ui_* switches only
// work on models whose owner pays for Sketchfab, so CROP also crops off the
// title bar, the button row and the "click & hold" hint (credits are in the
// site footer instead).
const OPTIONS = {
  autostart: 1, preload: 1, autospin: 0.25, scrollwheel: 0, transparent: 1, dnt: 1,
  ui_theme: "dark", ui_hint: 0, ui_help: 0, ui_settings: 0, ui_vr: 0, ui_ar: 0,
  ui_fullscreen: 0, ui_annotations: 0, ui_inspector: 0, ui_stop: 0, ui_loading: 0,
  ui_infos: 0, ui_controls: 0, ui_watermark: 0, ui_watermark_link: 0,
};
const ZOOM = 0.8; // after recentering, keep this fraction of the camera distance
const INTRO_MS = 1500; // Sketchfab's camera intro after "viewerready"
const CROP = { top: 72, bottom: 144 }; // px of iframe hidden above and below the stage
// Fade the viewer's edges to black so it melts into the black stage.
const EDGE_FADE = "radial-gradient(ellipse 62% 72% at 50% 50%, #000 62%, transparent 100%)";

type Vec3 = [number, number, number];
interface ViewerApi {
  start(): void;
  addEventListener(event: "viewerready", cb: () => void): void;
  getCameraLookAt(cb: (err: unknown, cam: { position: Vec3; target: Vec3 }) => void): void;
  setCameraLookAt(position: Vec3, target: Vec3, duration: number): void;
  recenterCamera?(cb: () => void): void;
  setBackground?(opts: { color: Vec3 }, cb?: (err: unknown) => void): void;
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

interface Props {
  uid: string;          // Sketchfab model id
  label: string;        // what the model is, for screen readers
  zoom?: number;        // camera distance after framing (1 = whole car, smaller = closer)
  lift?: number;        // raise the car on screen, as a fraction of the camera distance
  className?: string;
}

// A Sketchfab model on a black stage with Sketchfab's chrome hidden. The stage
// stays black until the model is ready, then the model fades in.
export default function SketchfabStage({ uid, label, zoom = ZOOM, lift = 0, className }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadApi().then(() => {
      if (!live || !frame.current || !window.Sketchfab) return;
      new window.Sketchfab(frame.current).init(uid, {
        ...OPTIONS,
        success(api) {
          api.start();
          api.addEventListener("viewerready", () => {
            // Replace the author's backdrop with plain black to match the stage.
            api.setBackground?.({ color: [0, 0, 0] });
            // Each author leaves the camera somewhere different, so frame the whole
            // car first, then move in a little. Wait out Sketchfab's intro camera
            // move first, or it overrides ours.
            const frameCar = () => api.getCameraLookAt((err, cam) => {
              if (!err) {
                const pos = cam.position.map((p, i) => cam.target[i] + (p - cam.target[i]) * zoom) as Vec3;
                // Sketchfab is z-up: sliding the camera and its target down raises the car on screen.
                const drop = lift * Math.hypot(...pos.map((p, i) => p - cam.target[i]));
                const down = (v: Vec3): Vec3 => [v[0], v[1], v[2] - drop];
                api.setCameraLookAt(down(pos), down(cam.target), 0);
              }
              if (live) setTimeout(() => setReady(uid), 150);
            });
            setTimeout(() => (api.recenterCamera ? api.recenterCamera(frameCar) : frameCar()), INTRO_MS);
          });
        },
        error() { /* leave the stage empty */ },
      });
    }).catch(() => { /* leave the stage empty */ });
    return () => { live = false; };
  }, [uid, zoom, lift]);

  return (
    <div className={`relative overflow-hidden bg-black ${className ?? ""}`}>
      <iframe
        key={uid}
        ref={frame}
        title={`3D model of a ${label}`}
        allow="autoplay; fullscreen; xr-spatial-tracking"
        className={`absolute inset-x-0 w-full border-0 transition-opacity duration-700 ${ready === uid ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ top: -CROP.top, height: `calc(100% + ${CROP.top + CROP.bottom}px)`, maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}
      />
    </div>
  );
}
