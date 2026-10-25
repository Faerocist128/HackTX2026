"use client";
import dynamic from "next/dynamic";
import { TOYOTA_MODELS } from "@/lib/vehicle/models3d";

const CarStage = dynamic(() => import("@/components/car/CarStage"), { ssr: false, loading: () => null });

/** The 3D car on the landing hero, standing in for Toyota's full-bleed photo. */
export function HeroCar({ className }: { className?: string }) {
  return <CarStage spec={TOYOTA_MODELS.camry} className={className} hint={false} />;
}
