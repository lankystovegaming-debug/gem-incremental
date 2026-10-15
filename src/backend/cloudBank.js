import { supabase } from "./supabase.js";

// Server-authoritative bank client. Every call maps to a SECURITY DEFINER
// RPC keyed to auth.uid(); cheque recipients are resolved server-side.
const MESSAGES = {
  unauthenticated: "Sign in to use the bank.",
  bank_invalid_amount: "Enter an amount greater than zero.",
  bank_insufficient_wallet: "You do not have enough money in your wallet.",
  bank_insufficient_balance: "You do not have that much in savings.",
  bank_over_limit: "That exceeds your available credit.",
  bank_no_loan: "You have no outstanding loan to repay.",
  bank_in_default: "Your loan is in default — clear it before borrowing again.",
  bank_borrow_frozen: "Borrowing is frozen after your bankruptcy.",
  bank_not_in_default: "You can only declare bankruptcy once a loan is past due.",
  bank_cheque_invalid_amount: "Enter a whole-dollar cheque amount between $1 and $1 trillion.",
  bank_cheque_invalid_recipient: "Enter a valid recipient username.",
  bank_cheque_recipient_not_found: "No player has that username.",
  bank_cheque_recipient_ambiguous: "More than one player has that username. Ask them to change it before sending.",
  bank_cheque_self_transfer: "You cannot write a cheque to yourself.",
  bank_cheque_limit: "You can have at most 20 uncashed cheques. Cancel one before writing another.",
  bank_cheque_sender_missing: "Your player account is unavailable.",
  bank_cheque_recipient_missing: "The recipient account is unavailable.",
  bank_cheque_not_found: "That cheque is unavailable to your account.",
  bank_cheque_already_settled: "That cheque has already been cashed or cancelled."
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
export const loadBankCheques = (incomingOffset = 0, outgoingOffset = 0) =>
  rpc("bank_list_cheques", { p_incoming_offset: incomingOffset, p_outgoing_offset: outgoingOffset });
export const bankIssueCheque = (username, amount) => rpc("bank_issue_cheque", { p_recipient_username: username, p_amount: amount });
export const bankCashCheque = (id) => rpc("bank_cash_cheque", { p_cheque_id: id });
export const bankCancelCheque = (id) => rpc("bank_cancel_cheque", { p_cheque_id: id });

// Search the same public player directory used by private messages. Pages keep
// the picker usable even when the player list grows large.
export async function searchChequeRecipients(query = "", offset = 0) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.user) return { data: null, error: normalise(sessionError || new Error("unauthenticated")) };
  const pageSize = 40;
  const pageOffset = Math.max(0, Math.floor(Number(offset) || 0));
  const text = String(query).trim();
  let request = supabase.from("public_player_directory")
    .select("id, username")
    .not("username", "is", null)
    .order("username", { ascending: true })
    .range(pageOffset, pageOffset + pageSize);
  if (text) request = request.ilike("username", `%${text}%`);
  const { data, error } = await request;
  if (error) return { data: null, error: normalise(error) };
  const page = data || [];
  return { data: {
    players: page.slice(0, pageSize).filter((player) => player.id !== session.user.id && player.username),
    hasMore: page.length > pageSize,
    nextOffset: pageOffset + pageSize
  }, error: null };
}
