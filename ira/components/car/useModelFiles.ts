"use client";
import { useEffect, useState } from "react";
import type { ModelFile } from "@/lib/vehicle/models3d";

// Real .glb files listed in public/cars/models.json. Fetched once per page load;
// a missing or broken manifest just means every car uses the generated model.
let manifest: Promise<Record<string, ModelFile>> | null = null;

export function useModelFiles(): Record<string, ModelFile> {
  const [files, setFiles] = useState<Record<string, ModelFile>>({});
  useEffect(() => {
    manifest ??= fetch("/cars/models.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => (j && typeof j === "object" ? (j as Record<string, ModelFile>) : {}))
      .catch(() => ({}));
    let live = true;
    manifest.then((m) => { if (live) setFiles(m); });
    return () => { live = false; };
  }, []);
  return files;
}
