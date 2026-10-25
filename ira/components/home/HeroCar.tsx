"use client";
import dynamic from "next/dynamic";
import { carModelFor } from "@/lib/vehicle/models3d";

const SketchfabStage = dynamic(() => import("@/components/car/SketchfabStage"), { ssr: false, loading: () => null });
const HERO = carModelFor("Toyota", "RAV4");
// The hero car renders at 85% of its "Your car" size: on-screen size goes with
// 1 / camera distance, so move the camera back by 1/0.85. 0.8 is the stage's default zoom.
const HERO_ZOOM = (HERO?.zoom ?? 0.8) / 0.85;

/** The 3D car on the landing hero, standing in for Toyota's full-bleed photo. */
export function HeroCar({ className }: { className?: string }) {
  if (!HERO) return null;
  return <SketchfabStage uid={HERO.uid} label={HERO.label.toLowerCase()} zoom={HERO_ZOOM} lift={0.015} className={className} />;
}
