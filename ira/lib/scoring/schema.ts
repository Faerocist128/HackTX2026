// Zod validation for anything crossing an API boundary.
import { z } from "zod";

const tier = z.enum(["superPrime", "prime", "nearPrime", "subprime", "deepSubprime"]);

export const ProfileSchema = z.object({
  customerId: z.string(),
  name: z.string().max(80),
  monthlyIncome: z.number().min(0).max(1e6),
  monthlyDebtPayments: z.number().min(0).max(1e6),
  dti: z.number(),
  totalBalances: z.number(),
  savingsBalance: z.number(),
  onTimePaymentRate: z.number().min(0).max(1),
  latePayments12mo: z.number().int().min(0).max(50),
  creditUtilization: z.number().min(0).max(5),
  creditScore: z.number().min(250).max(900).optional(),
  estCreditTier: tier,
  currentAutoLoan: z.object({
    balance: z.number().min(0).max(1e6),
    apr: z.number().min(0).max(40),
    monthlyPayment: z.number().min(0).max(1e5),
    monthsRemaining: z.number().int().min(0).max(120),
    originalTerm: z.number().int().min(1).max(120),
    originalAmount: z.number().optional(),
    subsidized: z.boolean().optional(),
  }),
  evidence: z.array(z.string().max(300)).max(20),
  source: z.literal("nessie"),
});

export const VehicleSchema = z.object({
  vin: z.string().optional(),
  year: z.number().int().min(1980).max(2030),
  make: z.string().max(40),
  model: z.string().max(60),
  trim: z.string().max(60).optional(),
  mileage: z.number().min(0).max(500_000),
  condition: z.enum(["excellent", "good", "fair", "poor"]),
  estValue: z.number().min(0),
  estRetail: z.number().min(0).optional(),
});

export const ScenarioSchema = z.object({
  termMonths: z.number().int().min(12).max(96),
  targetApr: z.number().min(0).max(40),
  loanType: z.enum(["fixed", "variable", "cash-out", "lease-buyout"]),
  paymentBehavior: z.enum(["early", "on-time", "late"]),
  extraMonthlyPayment: z.number().min(0).max(5_000),
  channel: z.enum(["creditUnion", "bank", "financeCompany"]),
  upfrontCosts: z.number().min(0).max(10_000),
  refunds: z.number().min(0).max(10_000),
  cashOutAmount: z.number().min(0).max(50_000),
  discountRate: z.number().min(0).max(30),
});

export const MarketRateSchema = z.object({
  typicalApr: z.number().min(0).max(40),
  note: z.string().max(400),
});

export const ScoreInputSchema = z.object({
  profile: ProfileSchema,
  vehicle: VehicleSchema,
  scenario: ScenarioSchema,
  market: MarketRateSchema.nullable().optional(),
});
