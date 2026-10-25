"use client";
// One store drives the whole audit: profile, vehicle, market rate and scenario (plan: useAuditStore).
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ManualInput } from "./nessie/personas";
import { applyScenarioPatch, defaultScenario } from "./scoring/defaults";
import { estimateApr } from "./scoring/rateModel";
import type { FinancialProfile, MarketRate, Scenario, Vehicle } from "./scoring/types";
import { vehicleAgeYears } from "./vehicle/value";

/** "manual" for "Use my own info", otherwise the demo persona id. */
export type PersonId = string;

interface AuditState {
  personaId: PersonId | null;
  manualInput: ManualInput | null;
  profile: FinancialProfile | null;
  vehicle: Vehicle | null;
  market: MarketRate | null;
  scenario: Scenario | null;
  initialScenario: Scenario | null;
  checkedSteps: string[];
  setProfile: (p: FinancialProfile, personaId: PersonId, manualInput?: ManualInput) => void;
  setVehicle: (v: Vehicle, market: MarketRate | null) => void;
  setScenario: (patch: Partial<Scenario>) => void;
  resetScenario: () => void;
  toggleStep: (id: string) => void;
}

/** Start term-matched at the rate the borrower would likely get. */
function startingScenario(profile: FinancialProfile, vehicle: Vehicle, market: MarketRate | null): Scenario {
  const s = defaultScenario(profile);
  const ltv = profile.currentAutoLoan.balance / Math.max(1, vehicle.estValue);
  const likely = estimateApr(profile.estCreditTier, ltv, vehicleAgeYears(vehicle.year), s.termMonths, s.channel, { market });
  return { ...s, targetApr: Math.round(likely.apr * 10) / 10 };
}

/** Keep the user's slider choices when only the numbers behind them changed. */
function carryChoices(fresh: Scenario, prev: Scenario | null): Scenario {
  if (!prev) return fresh;
  const { termMonths, loanType, paymentBehavior, extraMonthlyPayment, channel } = prev;
  return { ...fresh, termMonths, loanType, paymentBehavior, extraMonthlyPayment, channel };
}

export const useAuditStore = create<AuditState>()(
  persist(
    (set, get) => ({
      personaId: null,
      manualInput: null,
      profile: null,
      vehicle: null,
      market: null,
      scenario: null,
      initialScenario: null,
      checkedSteps: [],
      // Editing the same person keeps their car and slider choices; a new person starts over.
      setProfile: (profile, personaId, manualInput) => {
        const s = get();
        const same = s.personaId === personaId && !!s.profile;
        if (same && s.vehicle) {
          const fresh = startingScenario(profile, s.vehicle, s.market);
          set({ profile, personaId, manualInput: manualInput ?? s.manualInput, scenario: carryChoices(fresh, s.scenario), initialScenario: fresh });
          return;
        }
        set({
          profile,
          personaId,
          manualInput: manualInput ?? (personaId === "manual" ? s.manualInput : null),
          vehicle: same ? s.vehicle : null,
          market: same ? s.market : null,
          scenario: null,
          initialScenario: null,
          checkedSteps: [],
        });
      },
      setVehicle: (vehicle, market) => {
        const { profile, scenario, vehicle: prev } = get();
        if (!profile) return;
        const fresh = startingScenario(profile, vehicle, market);
        // Re-saving after "Back" keeps the sliders unless the car itself changed.
        const sameCar = prev && prev.year === vehicle.year && prev.make === vehicle.make && prev.model === vehicle.model;
        set({ vehicle, market, scenario: sameCar ? carryChoices(fresh, scenario) : fresh, initialScenario: fresh, checkedSteps: sameCar ? get().checkedSteps : [] });
      },
      setScenario: (patch) => {
        const { profile, vehicle, market, scenario } = get();
        if (profile && vehicle && scenario) set({ scenario: applyScenarioPatch({ profile, vehicle, scenario, market }, patch) });
      },
      resetScenario: () => set({ scenario: get().initialScenario, checkedSteps: [] }),
      toggleStep: (id) => {
        const c = get().checkedSteps;
        set({ checkedSteps: c.includes(id) ? c.filter((x) => x !== id) : [...c, id] });
      },
    }),
    { name: "ira-audit", storage: createJSONStorage(() => sessionStorage) },
  ),
);

/** True once the persisted store has loaded on the client (avoids SSR mismatch). */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(useAuditStore.persist.hasHydrated());
    return useAuditStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}

/** The engine input for the current audit, or null until profile, car and scenario exist. */
export function useScoreInput() {
  const { profile, vehicle, scenario, market } = useAuditStore();
  return useMemo(() => (profile && vehicle && scenario ? { profile, vehicle, scenario, market } : null), [profile, vehicle, scenario, market]);
}
