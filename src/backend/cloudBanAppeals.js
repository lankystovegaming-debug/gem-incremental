import { supabase } from "./supabase.js";


export function loadMyBanAppeal() {
  return supabase.rpc("get_my_ban_appeal");
}


export function submitBanAppeal(reason) {
  return supabase.rpc("submit_ban_appeal", { p_reason: reason });
}


export function acknowledgeBanAppealDecision(appealId) {
  return supabase.rpc("acknowledge_ban_appeal_decision", {
    p_appeal_id: appealId
  });
}
