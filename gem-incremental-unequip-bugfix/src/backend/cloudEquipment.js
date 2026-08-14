import {
  supabase
} from "./supabase.js";


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
          ascending: true
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


export async function unequipCloudEquipment(equipmentRowId) {
  const {
    data,
    error
  } = await supabase
    .from("player_equipment")
    .update({ equipped: false })
    .eq("id", equipmentRowId)
    .eq("equipped", true)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Failed to unequip cloud equipment:", error);

    return {
      success: false,
      message: "That equipment could not be unequipped."
    };
  }

  if (!data) {
    return {
      success: false,
      message: "That equipment is already unequipped or no longer exists."
    };
  }

  return { success: true };
}
