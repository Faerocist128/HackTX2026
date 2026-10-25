// Shared data contracts. Both stages and every API route speak these types.

export type CreditTier = "superPrime" | "prime" | "nearPrime" | "subprime" | "deepSubprime";

export interface AutoLoan {
  balance: number; // current principal (statement balance)
  apr: number; // percent, e.g. 11.9
  monthlyPayment: number;
  monthsRemaining: number;
  originalTerm: number;
  originalAmount?: number;
  /** True for a below-market captive/promotional rate (e.g. 3.99% TFS offer). */
  subsidized?: boolean;
}

export interface FinancialProfile {
  customerId: string;
  name: string;
  monthlyIncome: number; // gross
  monthlyDebtPayments: number; // housing + other debts, EXCLUDING the auto loan
  dti: number; // 0–1, including the current auto payment
  totalBalances: number;
  savingsBalance: number;
  onTimePaymentRate: number; // 0–1
  latePayments12mo: number; // 30-day lates in the last 12 months
  creditUtilization: number; // 0–1
  creditScore?: number; // VantageScore-style proxy when the source has one
  estCreditTier: CreditTier;
  currentAutoLoan: AutoLoan;
  /** Plain-language facts pulled from the source data, for evidence in next steps. */
  evidence: string[];
  source: "nessie";
}

export type Condition = "excellent" | "good" | "fair" | "poor";

export interface Vehicle {
  vin?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  mileage: number;
  condition: Condition;
  estValue: number; // conservative trade-in value (LTV denominator)
  estRetail?: number;
}

export type LoanType = "fixed" | "variable" | "cash-out" | "lease-buyout";
export type PaymentBehavior = "early" | "on-time" | "late";
export type LenderChannel = "creditUnion" | "bank" | "financeCompany";

export interface Scenario {
  termMonths: number;
  targetApr: number;
  loanType: LoanType;
  paymentBehavior: PaymentBehavior;
  extraMonthlyPayment: number;
  channel: LenderChannel;
  upfrontCosts: number;
  refunds: number;
  cashOutAmount: number;
  discountRate: number; // percent, research §6 default 5
}

export type Band = "red" | "yellow" | "green";
export type Verdict = "notEligible" | "keepCurrentLoan" | "wellPositioned" | "possible" | "notYet";
export type Approval = "high" | "medium" | "low";

/** The two scales: how likely a lender says yes, and whether the refinance is worth it. */
export type ScaleKey = "odds" | "worth";

export interface FactorBreakdown {
  key: FactorKey;
  label: string;
  weight: number;
  rawValue: number;
  points: number;
  maxPoints: number;
  direction: "helps" | "hurts";
  note: string;
}

export type OddsFactorKey = "creditTier" | "paymentHistory" | "ltv" | "dti" | "pti" | "vehicle" | "loanStructure";
export type WorthFactorKey = "rateGap" | "npvSavings" | "lifetimeCost" | "breakEven" | "paymentFit" | "loanRisk";
export type FactorKey = OddsFactorKey | WorthFactorKey;

export interface Scale {
  score: number; // 1–100: the sum of factor points, unless capped
  band: Band; // always bandOf(score), so the dial, number and label agree
  factors: FactorBreakdown[];
  /** Sum of factor points when a knockout cap or the rate ask pulled the score below it. */
  uncappedScore?: number;
  /** Approval odds only: the share of lenders likely to offer the target APR, when under 1. */
  rateAskMultiplier?: number;
  /** Why a cap pulled the score under its factor points: a knockout, the S2 approval level, or "keep your loan". */
  capReason?: "knockout" | "approval" | "keepLoan";
}

export interface ScoreMetrics {
  payoff: number;
  currentPayment: number;
  newPayment: number;
  monthlySavings: number;
  termMatchedPayment: number;
  termMatchedMonthlySavings: number;
  npvSavings: number;
  currentInterestLeft: number;
  newTotalInterest: number;
  /** Interest the extra monthly payment saves versus the same loan without it. */
  extraInterestSaved: number;
  /** Months sooner the extra monthly payment pays the new loan off. */
  extraMonthsSooner: number;
  /** Upfront fees + projected late fees − refunds on the loan the user built. */
  newFees: number;
  lifetimeInterestDelta: number; // = currentInterestLeft − newTotalInterest − newFees
  breakEvenMonths: number | null; // term-matched (§6), used by the score
  /** Months for the built loan's lower payment to repay the upfront fees; null if the payment isn't lower. */
  breakEvenMonthsScenario: number | null;
  ltv: number;
  ltvRetail: number | null;
  pti: number;
  dti: number;
  likelyApr: number;
  likelyAprRange: [number, number];
  creditedApr: number; // the APR the economics actually use (target, floored at likely low)
  monthsToPayoff: number;
  currentMonthsLeft: number;
}

export interface ScoreResult {
  odds: Scale;
  worth: Scale;
  verdict: Verdict;
  approval: Approval;
  knockouts: string[];
  reasons: string[];
  metrics: ScoreMetrics;
  checkAgainMonths: number | null;
}

/** Gemini's market-rate check, blended into the research rate model (see rateModel.ts). */
export interface MarketRate {
  typicalApr: number;
  note: string;
}

export interface ScoreInput {
  profile: FinancialProfile;
  vehicle: Vehicle;
  scenario: Scenario;
  market?: MarketRate | null;
  asOf?: Date;
}
