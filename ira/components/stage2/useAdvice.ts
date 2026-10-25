"use client";
import { useEffect, useRef, useState } from "react";
import type { Advice } from "@/lib/advice/types";
import type { ScoreInput } from "@/lib/scoring/types";

// Advice for inputs already explained this session, so the plan page doesn't ask Gemini again.
const cache = new Map<string, Advice>();

/**
 * Debounced 800 ms after inputs stop changing; the in-flight request is aborted
 * on new input. The last good advice stays on screen while updating, so the panel
 * never flickers to empty.
 */
export function useAdvice(input: Omit<ScoreInput, "asOf"> | null) {
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const key = input ? JSON.stringify(input) : "";

  useEffect(() => {
    if (!key) return;
    const hit = cache.get(key);
    if (hit) { setAdvice(hit); setError(null); setUpdating(false); return; }
    setUpdating(true);
    const t = setTimeout(async () => {
      ctl.current?.abort();
      const c = new AbortController();
      ctl.current = c;
      try {
        const res = await fetch("/api/advice", { method: "POST", headers: { "Content-Type": "application/json" }, body: key, signal: c.signal });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Gemini couldn't write your explanation.");
        cache.set(key, json as Advice);
        setAdvice(json as Advice);
        setError(null);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      }
      if (!c.signal.aborted) setUpdating(false);
    }, 800);
    return () => clearTimeout(t);
  }, [key]);

  useEffect(() => () => ctl.current?.abort(), []);
  return { advice, updating, error };
}
