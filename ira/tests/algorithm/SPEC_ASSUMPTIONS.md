# Refinance algorithm: spec and assumptions

The algorithm under test is `scoreRefinance()` in `lib/scoring/engine.ts`, plus everything it calls: `loanMath.ts`, `rateModel.ts`, `config.ts`, `bands.ts`, and `vehicleAgeYears()` from `lib/vehicle/value.ts`.

**Where the spec comes from.** There is no separate written spec. These tests treat three sources as the spec:
1. The research brief `docs/refi-research.pdf`, which the code cites by section:
   - §6 for the formulas
   - §8 S1–S5 for knockouts, approval, the rate estimate, the economics and the verdict
2. The policy constants in `lib/scoring/config.ts`.
3. The `ASSUMPTION` comments in the code, where they extend the brief.

Where the code and the brief disagree, the brief wins and the difference is logged as a bug.

## 1. Inputs (`ScoreInput`)

| Field | Type / units | Valid range (API schema) | Used by the engine? |
|---|---|---|---|
| `profile.monthlyIncome` | USD per month, gross | 0 – 1e6 | Yes: PTI and DTI. Income of 0 makes PTI = DTI = 1 |
| `profile.monthlyDebtPayments` | USD per month, excluding the car loan | 0 – 1e6 | Yes: DTI |
| `profile.onTimePaymentRate` | fraction 0–1 | 0 – 1 | Yes: payment history (≥ 0.98 counts as perfect) |
| `profile.latePayments12mo` | count | int 0 – 50 | Yes: knockout, approval, history |
| `profile.creditScore` | VantageScore-style, optional | 250 – 900 | Yes: S2 approval only. Missing → `TIER_MID_SCORE[tier]` |
| `profile.estCreditTier` | enum of 5 tiers | — | Yes: credit factor, base rate, check-again timing |
| `profile.currentAutoLoan.balance` | USD | 0 – 1e6 | Yes |
| `…apr` | **percent** (11.9 means 11.9%) | 0 – 40 | Yes |
| `…monthlyPayment` | USD per month, **as stated** | 0 – 1e5 | Yes: NPV, breakeven, payment fit (see A4) |
| `…monthsRemaining` | months | int 0 – 120 | Yes. Below 1 is treated as 1 in the math |
| `…originalTerm` | months | int 1 – 120 | Check-again timing only |
| `…subsidized` | boolean | — | Yes: forces "keep current loan" |
| `profile.dti`, `totalBalances`, `savingsBalance`, `creditUtilization`, `name`, `customerId`, `evidence` | — | — | **Not used** |
| `vehicle.year` | model year | 1980 – 2030 | Yes: age, measured from Oct 1 of the year before the model year |
| `vehicle.mileage` | miles | 0 – 500k | Yes |
| `vehicle.estValue` | USD trade-in | ≥ 0 | Yes: the LTV denominator. A value of 0 gives LTV = 9.99 |
| `vehicle.estRetail` | USD, optional | ≥ 0 | Only the `ltvRetail` metric |
| `vehicle.make/model/trim/condition/vin` | — | — | **Not used** (they already feed `estValue` upstream) |
| `scenario.termMonths` | months | int 12 – 96 | Yes |
| `scenario.targetApr` | percent | 0 – 40 | Yes. Never credited below the low end of the likely range |
| `scenario.loanType` | fixed / variable / cash-out / lease-buyout | — | Yes |
| `scenario.paymentBehavior` | early / on-time / late | — | Yes |
| `scenario.extraMonthlyPayment` | USD per month | 0 – 5,000 | Yes |
| `scenario.channel` | creditUnion / bank / financeCompany | — | Yes: the rate adjustment |
| `scenario.upfrontCosts`, `refunds` | USD | 0 – 10,000 | Yes |
| `scenario.cashOutAmount` | USD | 0 – 50,000 | Only when `loanType = "cash-out"` |
| `scenario.discountRate` | **percent** | 0 – 30 | Yes: NPV |
| `market.typicalApr` | percent, optional | 0 – 40 | Yes: rate nudge, ±1.5 points max |
| `asOf` | Date, optional | — | Yes: vehicle age (defaults to now) |

**How bad input is handled.** `scoreRefinance()` validates nothing. Only the API route `/api/advice` runs `ScoreInputSchema` (zod). The audit, scores and plan pages call the engine directly in the browser. Their inputs come from bounded sliders and from normalized Nessie data.

## 2. Outputs (`ScoreResult`)

| Output | Units / range | Rounding |
|---|---|---|
| `odds.score`, `worth.score` | integer 1–100 | Each factor's points rounded to 0.1, the total rounded to an integer, then clamped to 1–100 |
| `odds.band`, `worth.band` | red < 40 ≤ yellow < 70 ≤ green | — |
| `odds.uncappedScore` | present only when a knockout capped the score at 39 | — |
| `approval` | high / medium / low (§8 S2) | — |
| `verdict` | notEligible / keepCurrentLoan / wellPositioned / possible / notYet (§8 S5) | — |
| `knockouts` | list of strings (§8 S1) | — |
| `metrics.*` money values | USD as floats | **No rounding.** Display code rounds |
| `metrics.likelyApr`, `likelyAprRange` | percent | Rounded to 0.01 |
| `metrics.ltv/pti/dti` | fractions | none |
| `checkAgainMonths` | integer ≥ 3, or null | — |

## 3. Thresholds (each one gets an at / below / above test)

- **Knockouts (S1):**
  - balance < $5,000
  - monthsRemaining < 12
  - vehicle age > 10 years
  - mileage > 150,000
  - lates > 1
  - LTV > 1.30
- **Approval high (S2):** all of score ≥ 661, DTI ≤ 0.45, PTI ≤ 0.15, LTV ≤ 1.20, lates = 0, mileage ≤ 100,000.
- **Approval medium (S2):** all of score ≥ 601, DTI ≤ 0.50, PTI ≤ 0.20, LTV ≤ 1.30, lates ≤ 1.
- **Verdict (S5):**
  - Keep current loan: rate gap < 0.5, or NPV < $250, or the loan is subsidized.
  - Well positioned: approval high, and gap ≥ 1.0, and NPV ≥ max($500, 2% of payoff), and breakeven ≤ 6 months.
  - Otherwise "possible" when approval isn't low, else "notYet".
- **Credit tiers (VantageScore 4.0):** 781 / 661 / 601 / 501.
- **Rate adjustments (S3):**
  - LTV: ≤ 0.80 → −0.25; ≤ 1.00 → 0; ≤ 1.15 → +0.5; ≤ 1.25 → +1.0; above → +2.0
  - Age: ≤ 3 → −0.25; ≤ 6 → 0; ≤ 8 → +0.5; above → +1.0
  - Term: ≤ 48 → −0.25; ≤ 72 → 0; above → +1.5
  - Channel: credit union −0.5, bank 0, finance company +0.5
  - Loan type (ASSUMPTION): variable −0.75, cash-out +0.25, lease buyout +0.5
  - Market nudge: ±1.5 cap
  - Range: credit-union core − 0.75 to finance-company core + 0.75, low end floored at 0
- **Scoring ramps:** see the comments next to each factor in `engine.ts`. The "history" factor treats an on-time rate ≥ 0.98 as perfect.
- **Bands:** 40 / 70. The knockout cap is 39.

## 4. Assumptions the tests make

- **S1. "One unit" for the continuous thresholds** (DTI, PTI, LTV) is 0.0001 (0.01 percentage points). "At the threshold" is tested at threshold − 1e-9, because the inputs pass through float division.
- **S2. Inclusive boundaries.** The brief's ranges ("80–100%", "4–6 yrs") don't say which end is inclusive. The tests follow the code's `≤` boundaries. The brief also leaves vehicle ages between 3 and 4 years unassigned; the code gives them 0.
- **S3. Money tolerance is ±$0.01** against an independent floating-point reference. The engine never rounds money, so there is no cent rounding to check. A lender-style schedule that rounds the payment to the cent may differ from the engine by up to n × $0.005, and the tests allow that.
- **S4. Property tests use consistent loans** (the stated payment equals the amortized payment), except where a test is about inconsistency on purpose.

## 5. Problems found on read-through (each one confirmed by a probe, and by an xfail test)

- **A1. Cash-out is counted twice in the displayed NPV savings and the value score.** The brief's §6 formula is `PV(A_old) − PV(A_new) − costs + refunds`. A_new already includes repaying the cash-out, so that formula already treats the cash-out as a cost and never as a benefit, as the brief's §4 wants. The engine then subtracts `cashOut` again in `metrics.npvSavings`, which feeds the "Savings after fees" note and the value score's `npvSavings` factor.
  - Probe: a $2,000 cash-out lowers the displayed savings by $4,204, about twice the brief's penalty.
  - The verdict is not affected, because it adds the cash-out back (`researchNpv = npvSavings + cashOut`), which matches the brief. So the verdict and the displayed savings disagree.
- **A2. The odds dial contradicts the S2 approval.** Credit tier is only 22 of 100 odds points, so a borrower with a 450 credit score and otherwise perfect numbers scores 78, which is green: "Likely to be approved". At the same time, S2 approval is "low" and the verdict path treats approval as low.
- **A3. "Check again in N months" appears when waiting can't help.** The brief (§8 S5) gives a check-again date only for "Not yet". The engine also returns 3 months for knockouts that only get worse with time:
  - car older than 10 years
  - over 150,000 miles
  - balance under $5,000
  - fewer than 12 months left
- **A4. The stated payment and the amortized payment are never reconciled.** NPV, breakeven and payment fit use the stated `monthlyPayment`, while lifetime interest uses the payment implied by balance, APR and months.
  - If the stated payment is twice the real one, NPV savings become $24,322 while lifetime savings stay $1,708, and the result is "Well positioned".
  - A stated payment of 0 (missing data) gives "keep current loan" with NPV of −$21,417.
- **A5. No input validation in the engine.**
  - NaN produces NaN scores with the verdict "notYet".
  - `termMonths = 0` or a negative extra payment produces green scores and $25k–$35k of fake lifetime savings.
  - The schema blocks these at the API, but not on the client.
- **A6. A decimal APR is accepted silently.** A current APR of 0.12 (meant as 12%) passes the schema and yields "keep current loan". Nothing flags a likely percent-vs-decimal mix-up.
- **A7. The schema allows `monthsRemaining > originalTerm`.** That makes "months paid" negative, which pushes the seasoning check-again date out.
- **A8. Extra-payment savings are credited to the refinance.** "Total interest" compares the current loan with no extra payments against the new loan with them, yet the same extra payment could go to the current loan. This is documented in the code as intended (§7 "lead with total savings"), so the tests log it as a methodology concern, not an xfail.
- **A9. Paying "early" on the new loan raises approval odds.** History gets +0.5 level from future behavior, while lenders judge past history at application. Intended per the code's ASSUMPTION, so it is noted and not failed.
- **A10. Unused fields.** `creditUtilization`, `savingsBalance`, `totalBalances` and `profile.dti` don't affect anything. That's fine for fairness, but utilization is a major credit factor that the engine ignores.

**Bug ids.** These problems carry ids in TEST_REPORT.md: A1 = BUG-1, A2 = BUG-2, A3 = BUG-3, A4 = BUG-4, A5 = BUG-5, A6 = BUG-6, A7 = BUG-7. Testing also turned up two more:
- **BUG-8:** "keep" alongside a green value score. A8 is the cause.
- **BUG-9:** "well positioned" alongside a red value score.

The probe figures in this section used a slightly different baseline borrower than the test builder. TEST_REPORT.md has the figures recomputed with the builder.

## 6. Ambiguities that need a business decision

- How should cash-out count: neutral (only the financing cost), a penalty, or the brief's formula as written? The tests assume the brief's formula with no extra subtraction.
- Should the odds dial be limited by S2 approval, for example "low" approval → not green? The tests assume the dial must not say "likely to be approved" when S2 says low.
- Should "check again" be null for permanent knockouts? The tests assume yes.
