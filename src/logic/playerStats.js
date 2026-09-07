import {equipmentTotals} from '../../supabase/functions/roll/equipmentRules.js';
export function getPlayerStats(inventory) {
 const rows=(inventory.equipment??[]).filter(e=>e.equipped).map(e=>({...e,equipment_id:e.equipment_id??e.id,
 luck_bonus:e.luck_bonus??e.bonus?.luck??0,roll_speed_bonus:e.roll_speed_bonus??e.bonus?.rollSpeed??0,
 weight_luck_bonus:e.weight_luck_bonus??e.bonus?.weightLuck??0,weight_multiplier_bonus:e.weight_multiplier_bonus??e.bonus?.weightMultiplier??0,
 mutation_chance_bonus:e.mutation_chance_bonus??e.bonus?.mutationChance??0}));
 const totals=equipmentTotals(rows);return {luck:totals.luck,rollSpeed:totals.rollSpeed,weightLuck:totals.weightLuck,weightMultiplier:totals.weightMultiplier,mutationChance:totals.mutation};
}
