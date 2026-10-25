// Policy values. The research brief (§8, S5) says the thresholds are product
// policy choices, not industry standards, and should live in configuration.

export const POLICY = {
  // §8 S1 knockouts
  minBalance: 5_000,
  minMonthsRemaining: 12,
  maxVehicleAgeYears: 10,
  maxMileage: 150_000,
  maxLates12mo: 1, // 2+ lates is a knockout
  maxLtv: 1.3,

  // §8 S5 verdict thresholds
  keepLoanRateGap: 0.5,
  wellPositionedRateGap: 1.0,
  keepLoanNpv: 250,
  wellPositionedNpvFloor: 500,
  wellPositionedNpvPct: 0.02,
  wellPositionedBreakEven: 6,

  // §6 discount rate default; §6 cost table. $350 matches the design's copy
  // ("about $350 in fees"); research examples use $150–$175.
  defaultDiscountRate: 5,
  defaultUpfrontCosts: 350,
  perDiemDays: 10, // §4: lenders use the 10-day payoff amount

  // Display bands (plan: 0–39 red, 40–69 yellow, 70–100 green)
  bands: { yellow: 40, green: 70 },
} as const;
