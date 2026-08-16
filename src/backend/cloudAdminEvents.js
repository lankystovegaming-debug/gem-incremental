import { supabase } from "./supabase.js";

export async function canManageAdminEvents() {
  return supabase.rpc("can_manage_admin_events");
}

export async function loadActiveAdminEvent() {
  return supabase.rpc("get_active_admin_event");
}

export async function loadAdminEvents() {
  return supabase.rpc("admin_list_events");
}

export async function startAdminEvent(event) {
  return supabase.rpc("admin_start_event", {
    p_name: event.name,
    p_duration_minutes: event.durationMinutes,
    p_luck_bonus: event.luckBonus,
    p_roll_speed_bonus: event.rollSpeedBonus,
    p_weight_luck_bonus: event.weightLuckBonus,
    p_weight_multiplier_bonus: event.weightMultiplierBonus
  });
}

export async function stopAdminEvent(eventId) {
  return supabase.rpc("admin_stop_event", { p_event_id: eventId });
}
