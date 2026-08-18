import {
  supabase
} from "./supabase.js";
import { invokeFunction } from "./invoke.js";


export async function loadCloudEquipment() {
  const {
    data,
    error
  } =
    await supabase
      .from("player_equipment")
      .select(`
        id,
        equipment_id,
        category,
        tier,
        name,
        luck_bonus,
        roll_speed_bonus,
        weight_luck_bonus,
        weight_multiplier_bonus,
        enchant_id,
        enchant_grade,
        enchant_state,
        equipped,
        created_at
      `)
      .order(
        "category",
        {
          ascending: true
        }
      )
      .order(
        "tier",
        {
          ascending: false
        }
      );

  if (error) {
    console.error(
      "Failed to load cloud equipment:",
      error
    );

    return null;
  }

  return data;
}

export async function enchantCloudEquipment(equipmentRowId, relicGemId) {
  const { data, error } = await invokeFunction("enchant-equipment", {
    equipmentRowId,
    relicGemId
  });

  if (error) {
    return { success: false, message: error.message, data: null };
  }

  return { success: true, message: null, data };
}


export async function setCloudEquipmentEquipped(equipmentRowId, equipped) {
  const { error } = await invokeFunction("unequip-equipment", {
    equipmentRowId,
    equipped
  });

  if (error) {
    console.error("Failed to change equipped cloud equipment:", error);

    return {
      success: false,
      message: error.message
    };
  }

  return { success: true };
}
