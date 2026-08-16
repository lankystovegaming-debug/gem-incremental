import { supabase } from "./supabase.js";

export async function redeemCode(code) {
  return supabase.rpc("redeem_code", { p_code: code });
}

export async function loadAdminCodes() {
  return supabase.rpc("admin_list_codes");
}

export async function createAdminCode(options) {
  return supabase.rpc("admin_create_code", {
    p_code: options.code,
    p_money_reward: options.moneyReward,
    p_consumable_id: options.consumableId,
    p_consumable_quantity: options.consumableQuantity,
    p_expires_at: options.expiresAt,
    p_max_redemptions: options.maxRedemptions
  });
}

export async function setAdminCodeActive(codeId, active) {
  return supabase.rpc("admin_set_code_active", {
    p_code_id: codeId,
    p_active: active
  });
}
