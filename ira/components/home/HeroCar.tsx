"use client";
import dynamic from "next/dynamic";
import { carModelFor } from "@/lib/vehicle/models3d";

const SketchfabStage = dynamic(() => import("@/components/car/SketchfabStage"), { ssr: false, loading: () => null });
const HERO = carModelFor("Toyota", "RAV4");

/** The 3D car on the landing hero, standing in for Toyota's full-bleed photo. */
export function HeroCar({ className }: { className?: string }) {
  if (!HERO) return null;
  return <SketchfabStage uid={HERO.uid} label={HERO.label.toLowerCase()} zoom={HERO.zoom} className={className} />;
}
