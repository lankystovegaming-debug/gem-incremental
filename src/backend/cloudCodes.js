import { supabase } from "./supabase.js";

export async function redeemCode(code) {
  return supabase.rpc("redeem_code", { p_code: code });
}

export async function loadAdminCodes() {
  const [codesResult, rewardsResult] = await Promise.all([
    supabase.rpc("admin_list_codes"),
    supabase.rpc("admin_list_code_consumable_rewards")
  ]);
  if (codesResult.error) return codesResult;
  if (rewardsResult.error) return rewardsResult;
  const rewardsByCode = new Map((rewardsResult.data ?? []).map((row) => [row.code, row.rewards]));
  return {
    data: (codesResult.data ?? []).map((code) => ({
      ...code,
      consumable_rewards: rewardsByCode.get(String(code.code).toUpperCase()) ?? null
    })),
    error: null
  };
}

export async function createAdminCode(options) {
  const created = await supabase.rpc("admin_create_code", {
    p_code: options.code,
    p_money_reward: options.moneyReward,
    p_consumable_id: null,
    p_consumable_quantity: 0,
    p_expires_at: options.expiresAt,
    p_max_redemptions: options.maxRedemptions
  });
  if (created.error) return created;
  const rewards = await supabase.rpc("admin_set_code_consumable_rewards", {
    p_code: options.code,
    p_rewards: options.consumableRewards ?? []
  });
  return rewards.error ? rewards : created;
}

export async function setAdminCodeActive(codeId, active) {
  return supabase.rpc("admin_set_code_active", {
    p_code_id: codeId,
    p_active: active
  });
}

export async function deleteAdminCode(codeId) {
  return supabase.rpc("admin_delete_code", { p_code_id: codeId });
}
