import { supabase } from "./supabase.js";

// Server-authoritative bank client. Every call maps to a SECURITY DEFINER
// RPC keyed to auth.uid(); the amount is the only thing the client sends.
const MESSAGES = {
  unauthenticated: "Sign in to use the bank.",
  bank_invalid_amount: "Enter an amount greater than zero.",
  bank_insufficient_wallet: "You do not have enough money in your wallet.",
  bank_insufficient_balance: "You do not have that much in savings.",
  bank_over_limit: "That exceeds your available credit.",
  bank_no_loan: "You have no outstanding loan to repay.",
  bank_in_default: "Your loan is in default — clear it before borrowing again.",
  bank_borrow_frozen: "Borrowing is frozen after your bankruptcy.",
  bank_not_in_default: "You can only declare bankruptcy once a loan is past due."
};

function normalise(error) {
  if (!error) return null;
  const code = Object.keys(MESSAGES).find((value) => error.message?.includes(value)) ?? error.code;
  return { code, message: MESSAGES[code] ?? "The bank request could not be completed." };
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  return { data, error: normalise(error) };
}

export const loadBankDashboard = () => rpc("bank_get_dashboard");
export const bankDeposit = (amount) => rpc("bank_deposit", { p_amount: amount });
export const bankWithdraw = (amount) => rpc("bank_withdraw", { p_amount: amount });
export const bankBorrow = (amount) => rpc("bank_borrow", { p_amount: amount });
export const bankRepay = (amount) => rpc("bank_repay", { p_amount: amount });
export const bankDeclareBankruptcy = () => rpc("bank_declare_bankruptcy");
