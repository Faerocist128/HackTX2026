"use client";
import { useEffect, useRef, useState } from "react";
import type { Advice } from "@/lib/advice/types";
import type { ScoreInput } from "@/lib/scoring/types";

/**
 * Debounced 800 ms after inputs stop changing; the in-flight request is aborted
 * on new input. The last good advice stays on screen while updating, so the panel
 * never flickers to empty.
 */
export function useAdvice(input: Omit<ScoreInput, "asOf"> | null) {
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const key = input ? JSON.stringify(input) : "";

  useEffect(() => {
    if (!key) return;
    setUpdating(true);
    const t = setTimeout(async () => {
      ctl.current?.abort();
      const c = new AbortController();
      ctl.current = c;
      try {
        const res = await fetch("/api/advice", { method: "POST", headers: { "Content-Type": "application/json" }, body: key, signal: c.signal });
        if (!res.ok) throw new Error(String(res.status));
        setAdvice((await res.json()) as Advice);
        setError(false);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(true);
      }
      if (!c.signal.aborted) setUpdating(false);
    }, 800);
    return () => clearTimeout(t);
  }, [key]);

  useEffect(() => () => ctl.current?.abort(), []);
  return { advice, updating, error };
}
