// Raw Capital One Nessie shapes (only the fields we use).

export interface NessieCustomer {
  _id: string;
  first_name: string;
  last_name: string;
  address?: { street_number: string; street_name: string; city: string; state: string; zip: string };
}

export interface NessieAccount {
  _id: string;
  type: "Checking" | "Savings" | "Credit Card";
  nickname: string;
  rewards: number;
  balance: number;
  customer_id?: string;
}

export interface NessieBill {
  _id?: string;
  status: "pending" | "cancelled" | "completed" | "recurring";
  payee: string;
  nickname: string;
  creation_date?: string;
  payment_date?: string;
  recurring_date?: number;
  upcoming_payment_date?: string;
  payment_amount: number;
}

export interface NessieDeposit {
  _id?: string;
  medium: "balance";
  transaction_date: string;
  status: "pending" | "cancelled" | "completed";
  amount: number;
  description: string;
}

export interface NessiePurchase {
  _id?: string;
  merchant_id?: string;
  medium: "balance";
  purchase_date: string;
  amount: number;
  status: string;
  description: string;
}

export interface NessieLoan {
  _id?: string;
  type: "home" | "auto" | "small business";
  status: "pending" | "approved" | "declined";
  credit_score: number;
  monthly_payment: number;
  amount: number;
  description: string;
}

/** Everything we fetch for one customer, keyed by account id. */
export interface NessieBundle {
  customer: NessieCustomer;
  accounts: NessieAccount[];
  bills: Record<string, NessieBill[]>;
  deposits: Record<string, NessieDeposit[]>;
  purchases: Record<string, NessiePurchase[]>;
  loans: Record<string, NessieLoan[]>;
}
