// The three demo personas from the build plan, plus the same shape built from
// "Use my own info". Each is rendered into Nessie records relative to "today" and
// written to Nessie (write.ts); the app reads them back from the live API.

import { balanceAfter } from "../scoring/loanMath";
import { TIER_MID_SCORE } from "../scoring/rateModel";
import type { Condition, CreditTier } from "../scoring/types";
import type { NessieBill, NessieBundle, NessieDeposit, NessieLoan } from "./types";

export interface PersonaSpec {
  id: string;
  first: string;
  last: string;
  blurb: string;
  targetBand: "green" | "yellow" | "red";
  grossMonthlyIncome: number;
  savings: number;
  checking: number;
  card?: { balance: number; limit: number };
  creditScore: number;
  /** Monthly obligations other than the car loan. `debt` ones count toward DTI. */
  bills: { payee: string; amount: number; dueDay: number; debt: boolean }[];
  /** Bill payee + months ago (1 = last month) + days late, for each late payment. */
  lates: { payee: string; monthsAgo: number; daysLate: number }[];
  loan: { amount: number; apr: number; term: number; paid: number; subsidized?: boolean };
  vehicle?: { year: number; make: string; model: string; trim?: string; mileage: number; condition: Condition; vin?: string };
}

export const PERSONAS: PersonaSpec[] = [
  {
    id: "ready-rachel",
    first: "Rachel",
    last: "Ready",
    blurb: "Steady income, bills always on time, dealer-arranged rate",
    targetBand: "green",
    grossMonthlyIncome: 7_400,
    savings: 9_800,
    checking: 3_200,
    card: { balance: 600, limit: 6_000 },
    creditScore: 728,
    bills: [
      { payee: "Rent", amount: 1_650, dueDay: 1, debt: true },
      { payee: "Visa card minimum", amount: 35, dueDay: 12, debt: true },
      { payee: "Electric utility", amount: 110, dueDay: 18, debt: false },
      { payee: "Phone", amount: 70, dueDay: 22, debt: false },
    ],
    lates: [],
    loan: { amount: 29_500, apr: 12.4, term: 72, paid: 14 },
    vehicle: { year: 2024, make: "Toyota", model: "RAV4", trim: "XLE", mileage: 24_000, condition: "excellent" },
  },
  {
    id: "almost-alex",
    first: "Alex",
    last: "Almost",
    blurb: "Decent income, one late bill, cards running high",
    targetBand: "yellow",
    grossMonthlyIncome: 5_200,
    savings: 1_200,
    checking: 900,
    card: { balance: 3_900, limit: 5_000 },
    creditScore: 648,
    bills: [
      { payee: "Rent", amount: 1_350, dueDay: 1, debt: true },
      { payee: "Store card minimum", amount: 95, dueDay: 9, debt: true },
      { payee: "Student loan", amount: 180, dueDay: 15, debt: true },
      { payee: "Electric utility", amount: 95, dueDay: 20, debt: false },
    ],
    lates: [{ payee: "Electric utility", monthsAgo: 4, daysLate: 34 }],
    loan: { amount: 22_000, apr: 16.9, term: 72, paid: 24 },
    vehicle: { year: 2022, make: "Toyota", model: "Camry", trim: "SE", mileage: 48_000, condition: "good" },
  },
  {
    id: "rebuilding-riley",
    first: "Riley",
    last: "Rebuilding",
    blurb: "High debt load, missed bills, owes more than the car is worth",
    targetBand: "red",
    grossMonthlyIncome: 3_500,
    savings: 150,
    checking: 220,
    card: { balance: 2_800, limit: 3_000 },
    creditScore: 566,
    bills: [
      { payee: "Rent", amount: 1_200, dueDay: 1, debt: true },
      { payee: "Card minimum", amount: 90, dueDay: 7, debt: true },
      { payee: "Personal loan", amount: 210, dueDay: 14, debt: true },
      { payee: "Electric utility", amount: 85, dueDay: 19, debt: false },
      { payee: "Phone", amount: 60, dueDay: 24, debt: false },
    ],
    lates: [
      { payee: "Electric utility", monthsAgo: 2, daysLate: 38 },
      { payee: "Phone", monthsAgo: 5, daysLate: 31 },
      { payee: "Card minimum", monthsAgo: 9, daysLate: 45 },
    ],
    loan: { amount: 19_000, apr: 19.9, term: 72, paid: 10 },
    vehicle: { year: 2019, make: "Toyota", model: "Corolla", trim: "LE", mileage: 96_000, condition: "fair" },
  },
];

export const personaById = (id: string) => PERSONAS.find((p) => p.id === id);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthsBack = (asOf: Date, m: number, day: number) =>
  new Date(asOf.getFullYear(), asOf.getMonth() - m, Math.min(day, 28));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/**
 * Render a persona as Nessie records. Encoding conventions (Nessie has no fields
 * for these; normalize.ts parses them back):
 *   bill.nickname    "<payee> | due YYYY-MM-DD | debt" (or "| other")
 *   account.nickname "<name> | limit <n>"            (credit cards)
 *   loan.description "Auto loan | apr <x> | term <n> | paid <k> [| subsidized]"
 * ASCII only: Nessie corrupts non-ASCII characters in stored strings.
 */
export function personaBills(p: PersonaSpec, asOf = new Date()): NessieBill[] {
  const out: NessieBill[] = [];
  for (let m = 12; m >= 1; m--) {
    for (const b of p.bills) {
      const due = monthsBack(asOf, m, b.dueDay);
      const late = p.lates.find((l) => l.payee === b.payee && l.monthsAgo === m);
      const paid = late ? addDays(due, late.daysLate) : addDays(due, -2);
      out.push({
        status: "completed",
        payee: b.payee,
        nickname: `${b.payee} | due ${iso(due)} | ${b.debt ? "debt" : "other"}`,
        payment_date: iso(paid),
        // Nessie bug: GET /bills returns 400 for the whole account if any bill
        // lacks payment_date or recurring_date, so every bill carries both.
        recurring_date: b.dueDay,
        payment_amount: b.amount,
      });
    }
  }
  for (const b of p.bills) {
    out.push({
      status: "recurring",
      payee: b.payee,
      nickname: `${b.payee} | due ${iso(monthsBack(asOf, 0, b.dueDay))} | ${b.debt ? "debt" : "other"}`,
      payment_date: iso(monthsBack(asOf, 0, b.dueDay)), // also required for GET /bills to succeed
      recurring_date: b.dueDay,
      payment_amount: b.amount,
    });
  }
  return out;
}

export function personaDeposits(p: PersonaSpec, asOf = new Date()): NessieDeposit[] {
  // Paid twice monthly; gross pay (normalize treats payroll deposits as gross).
  const out: NessieDeposit[] = [];
  for (let m = 6; m >= 1; m--) {
    for (const day of [1, 15]) {
      out.push({
        medium: "balance",
        transaction_date: iso(monthsBack(asOf, m, day)),
        status: "completed",
        amount: Math.round((p.grossMonthlyIncome / 2) * 100) / 100,
        description: "Payroll",
      });
    }
  }
  return out;
}

export function personaLoan(p: PersonaSpec, monthlyPayment: number): NessieLoan {
  const l = p.loan;
  return {
    type: "auto",
    status: "approved",
    credit_score: p.creditScore,
    monthly_payment: Math.round(monthlyPayment * 100) / 100,
    amount: l.amount,
    description: `Auto loan | apr ${l.apr} | term ${l.term} | paid ${l.paid}${l.subsidized ? " | subsidized" : ""}`,
  };
}

export interface ManualInput {
  firstName: string;
  monthlyIncome: number;
  monthlyDebts: number;
  balance: number;
  apr: number | null; // blank → estimate (design: "leave it blank and we'll estimate")
  monthsLeft: number;
  credit: CreditTier;
  lates: number;
}

/** Research §1: market average for an existing loan when the user doesn't know their APR. */
export const AVG_USED_LOAN_APR = 11.19;

/*
 * "Use my own info" as a Nessie person. The original loan is back-solved so that
 * normalize() reads the same balance and months left that were typed in:
 * B_k is linear in P, so P = balance / B_k(1). Late payments are placed on the
 * debts bill (or a small "Other bills" bill when there are no debts), since
 * Nessie only records lateness on bills.
 */
export function manualSpec(m: ManualInput): PersonaSpec {
  const apr = m.apr ?? AVG_USED_LOAN_APR;
  const term = Math.max(m.monthsLeft, Math.ceil((m.monthsLeft + 12) / 12) * 12);
  const paid = term - m.monthsLeft;
  const unit = balanceAfter(1, apr, term, paid);
  const bills: PersonaSpec["bills"] = [];
  if (m.monthlyDebts > 0) bills.push({ payee: "Monthly debt payments", amount: Math.round(m.monthlyDebts), dueDay: 1, debt: true });
  if (m.lates > 0 && !bills.length) bills.push({ payee: "Other bills", amount: 50, dueDay: 15, debt: false });
  const latePayee = bills[0]?.payee;
  return {
    id: "manual",
    first: asciiName(m.firstName) || "You",
    last: "(own info)",
    blurb: "Your own info",
    targetBand: "yellow",
    grossMonthlyIncome: m.monthlyIncome,
    savings: 0,
    checking: 0,
    creditScore: TIER_MID_SCORE[m.credit],
    bills,
    lates: Array.from({ length: m.lates }, (_, i) => ({ payee: latePayee!, monthsAgo: 2 + i * 3, daysLate: 35 })),
    loan: { amount: Math.round((m.balance / Math.max(unit, 1e-6)) * 100) / 100, apr, term, paid },
  };
}

/** Nessie corrupts non-ASCII, so "Zoë" is stored as "Zoe"; emoji and other symbols are dropped. */
export function asciiName(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

/** The same records the seed script writes, with stable fake ids (tests and scripts only). */
export function personaBundle(p: PersonaSpec, monthlyPayment: number, asOf = new Date()): NessieBundle {
  const ids = { chk: `${p.id}-chk`, sav: `${p.id}-sav`, card: `${p.id}-card` };
  return {
    customer: { _id: p.id, first_name: p.first, last_name: p.last },
    accounts: [
      { _id: ids.chk, type: "Checking", nickname: "Everyday checking", rewards: 0, balance: p.checking },
      { _id: ids.sav, type: "Savings", nickname: "Savings", rewards: 0, balance: p.savings },
      ...(p.card ? [{ _id: ids.card, type: "Credit Card" as const, nickname: `Card | limit ${p.card.limit}`, rewards: 0, balance: p.card.balance }] : []),
    ],
    bills: { [ids.chk]: personaBills(p, asOf) },
    deposits: { [ids.chk]: personaDeposits(p, asOf) },
    purchases: {},
    loans: { [ids.chk]: [personaLoan(p, monthlyPayment)] },
  };
}
