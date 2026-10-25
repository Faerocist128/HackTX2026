"use client";
// One store drives both stages: profile, vehicle and scenario (plan: useAuditStore).
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { defaultScenario } from "./scoring/defaults";
import { estimateApr } from "./scoring/rateModel";
import type { FinancialProfile, Scenario, Vehicle } from "./scoring/types";
import { vehicleAgeYears } from "./vehicle/value";

interface AuditState {
  personaId: string | null;
  profile: FinancialProfile | null;
  vehicle: Vehicle | null;
  scenario: Scenario | null;
  initialScenario: Scenario | null;
  checkedSteps: string[];
  setProfile: (p: FinancialProfile, personaId: string | null) => void;
  setVehicle: (v: Vehicle) => void;
  setScenario: (patch: Partial<Scenario>) => void;
  resetScenario: () => void;
  toggleStep: (id: string) => void;
}

/** Start term-matched at the rate the borrower would likely get. */
function startingScenario(profile: FinancialProfile, vehicle: Vehicle): Scenario {
  const s = defaultScenario(profile);
  const ltv = profile.currentAutoLoan.balance / Math.max(1, vehicle.estValue);
  const likely = estimateApr(profile.estCreditTier, ltv, vehicleAgeYears(vehicle.year), s.termMonths, s.channel);
  return { ...s, targetApr: Math.round(likely.apr * 10) / 10 };
}

export const useAuditStore = create<AuditState>()(
  persist(
    (set, get) => ({
      personaId: null,
      profile: null,
      vehicle: null,
      scenario: null,
      initialScenario: null,
      checkedSteps: [],
      // A new person means a new car too; keep the car only when re-saving the same profile.
      setProfile: (profile, personaId) =>
        set((s) => ({
          profile,
          personaId,
          vehicle: s.personaId === personaId && s.profile?.customerId === profile.customerId ? s.vehicle : null,
          scenario: null,
          initialScenario: null,
          checkedSteps: [],
        })),
      setVehicle: (vehicle) => {
        const { profile } = get();
        const scenario = profile ? startingScenario(profile, vehicle) : null;
        set({ vehicle, scenario, initialScenario: scenario, checkedSteps: [] });
      },
      setScenario: (patch) => {
        const s = get().scenario;
        if (s) set({ scenario: { ...s, ...patch } });
      },
      resetScenario: () => set({ scenario: get().initialScenario, checkedSteps: [] }),
      toggleStep: (id) => {
        const c = get().checkedSteps;
        set({ checkedSteps: c.includes(id) ? c.filter((x) => x !== id) : [...c, id] });
      },
    }),
    { name: "refi-audit", storage: createJSONStorage(() => sessionStorage) },
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
