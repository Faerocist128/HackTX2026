// Typed Nessie fetchers. Server-only: the key never reaches the browser.
import "server-only";
import type {
  NessieAccount,
  NessieBill,
  NessieBundle,
  NessieCustomer,
  NessieDeposit,
  NessieLoan,
  NessiePurchase,
} from "./types";

const BASE = process.env.NESSIE_BASE_URL ?? "https://api.nessieisreal.com";
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();

export const nessieOffline = () => process.env.NESSIE_OFFLINE === "1" || !process.env.NESSIE_API_KEY;

async function get<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}key=${process.env.NESSIE_API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6_000), cache: "no-store" });
  if (!res.ok) throw new Error(`Nessie ${path} → ${res.status}`);
  const data = (await res.json()) as T;
  cache.set(path, { at: Date.now(), data });
  return data;
}

export const getCustomer = (id: string) => get<NessieCustomer>(`/customers/${id}`);
export const getAccounts = (id: string) => get<NessieAccount[]>(`/customers/${id}/accounts`);
export const getBills = (acct: string) => get<NessieBill[]>(`/accounts/${acct}/bills`);
export const getDeposits = (acct: string) => get<NessieDeposit[]>(`/accounts/${acct}/deposits`);
export const getPurchases = (acct: string) => get<NessiePurchase[]>(`/accounts/${acct}/purchases`);
export const getLoans = (acct: string) => get<NessieLoan[]>(`/accounts/${acct}/loans`);

export async function fetchBundle(customerId: string): Promise<NessieBundle> {
  const [customer, accounts] = await Promise.all([getCustomer(customerId), getAccounts(customerId)]);
  const bundle: NessieBundle = { customer, accounts, bills: {}, deposits: {}, purchases: {}, loans: {} };
  await Promise.all(
    accounts.map(async (a) => {
      const [b, d, p, l] = await Promise.all([
        getBills(a._id).catch(() => []),
        getDeposits(a._id).catch(() => []),
        getPurchases(a._id).catch(() => []),
        getLoans(a._id).catch(() => []),
      ]);
      bundle.bills[a._id] = b;
      bundle.deposits[a._id] = d;
      bundle.purchases[a._id] = p;
      bundle.loans[a._id] = l;
    }),
  );
  return bundle;
}
