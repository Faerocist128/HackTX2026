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
  source: "nessie" | "fixture" | "manual";
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

export type FactorKey =
  | "rateGap"
  | "npvSavings"
  | "lifetimeCost"
  | "breakEven"
  | "ltv"
  | "dti"
  | "pti"
  | "paymentHistory"
  | "creditTier"
  | "vehicle"
  | "loanStructure";

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
  lifetimeInterestDelta: number; // positive = refinance costs less over its life, net of fees
  breakEvenMonths: number | null;
  ltv: number;
  ltvRetail: number | null;
  pti: number;
  dti: number;
  likelyApr: number;
  likelyAprRange: [number, number];
  creditedApr: number; // the APR the economics actually use (target, floored at likely low)
  monthsToPayoff: number;
}

export interface ScoreResult {
  score: number;
  band: Band;
  verdict: Verdict;
  approval: Approval;
  knockouts: string[];
  reasons: string[];
  factors: FactorBreakdown[];
  metrics: ScoreMetrics;
  checkAgainMonths: number | null;
}

export interface ScoreInput {
  profile: FinancialProfile;
  vehicle: Vehicle;
  scenario: Scenario;
  asOf?: Date;
}
