import { withSupabase } from "npm:@supabase/server";
// =========================================================
// KNOWN GEM NAMES
// =========================================================
const knownGems = new Set([
  "Quartz",
  "Calcite",
  "Feldspar",
  "Fluorite",
  "Hematite",
  "Obsidian",
  "Agate",
  "Jasper",
  "Amethyst",
  "Garnet",
  "Peridot",
  "Topaz",
  "Aquamarine",
  "Tourmaline",
  "Opal",
  "Zircon",
  "Spinel",
  "Sapphire",
  "Ruby",
  "Emerald",
  "Diamond",
  "Tanzanite",
  "Alexandrite",
  "Benitoite",
  "Red Beryl",
  "Black Opal",
  "Grandidierite",
  "Taaffeite",
  "Musgravite",
  "Painite",
  "Dark Matter"
]);
// =========================================================
// CANONICAL CRAFTING PROGRESS SCHEMA
//
// Only progress fields that can legitimately exist
// in the current recipes are included.
// =========================================================
const recipeSchemas = {
  "crude-pickaxe": {
    Quartz: {
      type: "number",
      max: 5
    },
    Feldspar: {
      type: "number",
      max: 3
    },
    Fluorite: {
      type: "number",
      max: 2
    },
    Amethyst: {
      type: "number",
      max: 1
    }
  },
  "reinforced-pickaxe": {
    Hematite: {
      type: "number",
      max: 4
    },
    Obsidian: {
      type: "number",
      max: 3
    },
    Garnet: {
      type: "number",
      max: 2
    },
    Peridot: {
      type: "number",
      max: 1
    }
  },
  "polished-pickaxe": {
    Garnet: {
      type: "number",
      max: 1
    },
    Peridot: {
      type: "number",
      max: 1
    },
    Topaz: {
      type: "number",
      max: 1
    },
    Aquamarine: {
      type: "number",
      max: 1
    }
  },
  "refined-pickaxe": {
    Topaz: {
      type: "number",
      max: 1
    },
    Aquamarine: {
      type: "number",
      max: 1
    },
    Tourmaline: {
      type: "number",
      max: 1
    },
    Opal: {
      type: "number",
      max: 1
    }
  },
  "masterwork-pickaxe": {
    Quartz: {
      type: "number",
      max: 100
    },
    Feldspar: {
      type: "number",
      max: 50
    },
    Hematite: {
      type: "number",
      max: 25
    },
    Obsidian: {
      type: "number",
      max: 15
    },
    Sapphire: {
      type: "number",
      max: 1
    }
  },
  // =======================================================
  // LANTERNS
  // =======================================================
  "dim-lantern": {
    Calcite: {
      type: "number",
      max: 5
    },
    Fluorite: {
      type: "number",
      max: 3
    },
    Hematite: {
      type: "number",
      max: 2
    },
    Jasper: {
      type: "number",
      max: 1
    }
  },
  "bright-lantern": {
    Fluorite: {
      type: "number",
      max: 4
    },
    Hematite: {
      type: "number",
      max: 3
    },
    Amethyst: {
      type: "number",
      max: 2
    },
    Garnet: {
      type: "number",
      max: 1
    }
  },
  "radiant-lantern": {
    Peridot: {
      type: "number",
      max: 3
    }
  },
  "beacon-lantern": {
    "beacon-fluorite": {
      type: "number",
      max: 1
    },
    "beacon-hematite": {
      type: "number",
      max: 1
    },
    "beacon-agate": {
      type: "number",
      max: 1
    },
    "beacon-amethyst": {
      type: "number",
      max: 1
    }
  },
  "eternal-lantern": {
    Amethyst: {
      type: "number",
      max: 1
    },
    Peridot: {
      type: "number",
      max: 1
    },
    Aquamarine: {
      type: "number",
      max: 1
    },
    Opal: {
      type: "number",
      max: 1
    },
    Sapphire: {
      type: "number",
      max: 1
    },
    Emerald: {
      type: "number",
      max: 1
    }
  },
  // =======================================================
  // BOOTS
  // =======================================================
  "miners-boots": {
    Quartz: {
      type: "number",
      max: 4
    },
    Calcite: {
      type: "number",
      max: 3
    },
    Obsidian: {
      type: "number",
      max: 2
    },
    Jasper: {
      type: "number",
      max: 1
    }
  },
  "reinforced-boots": {
    Feldspar: {
      type: "number",
      max: 4
    },
    Hematite: {
      type: "number",
      max: 3
    },
    Jasper: {
      type: "number",
      max: 2
    },
    Amethyst: {
      type: "number",
      max: 1
    }
  },
  "prospectors-boots": {
    "prospector-quartz": {
      type: "number",
      max: 1000
    },
    "prospector-obsidian": {
      type: "number",
      max: 900
    },
    "prospector-amethyst": {
      type: "number",
      max: 500
    }
  },
  "fortune-boots": {
    "fortune-huge": {
      type: "number",
      max: 1
    },
    "fortune-heavy": {
      type: "number",
      max: 1
    },
    "fortune-normal": {
      type: "number",
      max: 1
    },
    "fortune-small": {
      type: "number",
      max: 1
    }
  },
  "gravity-boots": {
    "gravity-specimen": {
      type: "number",
      max: 1
    }
  },
  // =======================================================
  // BAGS
  // =======================================================
  "worn-bag": {
    Quartz: {
      type: "number",
      max: 6
    },
    Feldspar: {
      type: "number",
      max: 4
    },
    Hematite: {
      type: "number",
      max: 2
    },
    Amethyst: {
      type: "number",
      max: 1
    }
  },
  "sturdy-bag": {
    Feldspar: {
      type: "number",
      max: 6
    },
    Obsidian: {
      type: "number",
      max: 4
    },
    Jasper: {
      type: "number",
      max: 2
    },
    Garnet: {
      type: "number",
      max: 1
    }
  },
  "reinforced-bag": {
    "reinforced-bag-value": {
      type: "number",
      max: 7500
    }
  },
  "gemkeeper-bag": {
    "gemkeeper-rarity": {
      type: "rarity-points",
      maxPoints: 500
    }
  },
  "bottomless-bag": {
    "bottomless-gems": {
      type: "gem-range",
      gems: [
        "Quartz",
        "Calcite",
        "Feldspar",
        "Fluorite",
        "Hematite",
        "Obsidian",
        "Agate",
        "Jasper",
        "Amethyst",
        "Garnet",
        "Peridot",
        "Topaz",
        "Aquamarine",
        "Tourmaline",
        "Opal",
        "Zircon",
        "Spinel",
        "Sapphire"
      ],
      maxEach: 1
    }
  }
};
// =========================================================
// SANITIZE ONE RECIPE'S PROGRESS
// =========================================================
function sanitizeRecipeProgress(recipeId, rawProgress) {
  const schema = recipeSchemas[recipeId];
  if (!schema || !rawProgress || typeof rawProgress !== "object" || Array.isArray(rawProgress)) {
    return {};
  }
  const raw = rawProgress;
  const clean = {};
  for (const [key, definition] of Object.entries(schema)){
    const value = raw[key];
    // -------------------------------------------------------
    // NUMERIC PROGRESS
    // -------------------------------------------------------
    if (definition.type === "number") {
      const numeric = Number(value ?? 0);
      clean[key] = Number.isFinite(numeric) ? Math.min(Math.max(numeric, 0), definition.max) : 0;
      continue;
    }
    // -------------------------------------------------------
    // RARITY POINTS
    // -------------------------------------------------------
    if (definition.type === "rarity-points") {
      const objectValue = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      const rawPoints = Number(objectValue.points ?? 0);
      const points = Number.isFinite(rawPoints) ? Math.min(Math.max(rawPoints, 0), definition.maxPoints) : 0;
      const rawGemTypes = Array.isArray(objectValue.gemTypes) ? objectValue.gemTypes : [];
      const gemTypes = [
        ...new Set(rawGemTypes.filter((name)=>typeof name === "string" && knownGems.has(name)))
      ];
      clean[key] = {
        points,
        gemTypes
      };
      continue;
    }
    // -------------------------------------------------------
    // GEM RANGE
    // -------------------------------------------------------
    if (definition.type === "gem-range") {
      const objectValue = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      const gemProgress = {};
      for (const gemName of definition.gems){
        const numeric = Number(objectValue[gemName] ?? 0);
        gemProgress[gemName] = Number.isFinite(numeric) ? Math.min(Math.max(numeric, 0), definition.maxEach) : 0;
      }
      clean[key] = gemProgress;
    }
  }
  return clean;
}
// =========================================================
// EDGE FUNCTION
// =========================================================
export default {
  fetch: withSupabase({
    auth: "user"
  }, async (req, ctx)=>{
    // =====================================================
    // IDENTIFY PLAYER
    // =====================================================
    const playerId = ctx.userClaims?.id;
    if (!playerId) {
      return Response.json({
        error: "Could not identify player."
      }, {
        status: 401
      });
    }
    // =====================================================
    // CHECK MIGRATION STATUS
    // =====================================================
    const { data: player, error: playerError } = await ctx.supabaseAdmin.from("players").select("crafting_migrated").eq("id", playerId).single();
    if (playerError || !player) {
      console.error("Failed to load player:", playerError);
      return Response.json({
        error: "Player not found."
      }, {
        status: 404
      });
    }
    if (player.crafting_migrated) {
      return Response.json({
        error: "Crafting has already been migrated."
      }, {
        status: 409
      });
    }
    // =====================================================
    // READ LOCAL STATE
    // =====================================================
    let body;
    try {
      body = await req.json();
    } catch  {
      return Response.json({
        error: "Invalid request."
      }, {
        status: 400
      });
    }
    const localState = body.craftingState;
    if (!localState || typeof localState !== "object" || Array.isArray(localState)) {
      return Response.json({
        error: "Invalid crafting state."
      }, {
        status: 400
      });
    }
    // =====================================================
    // VALIDATE AUTO CRAFT TARGET
    // =====================================================
    const rawAutoCraft = localState.activeAutoCraftRecipeId;
    const activeAutoCraft = typeof rawAutoCraft === "string" && recipeSchemas[rawAutoCraft] ? rawAutoCraft : null;
    // =====================================================
    // SANITIZE RECIPE PROGRESS
    // =====================================================
    const rawProgress = localState.progress && typeof localState.progress === "object" && !Array.isArray(localState.progress) ? localState.progress : {};
    const progressRows = [];
    for (const recipeId of Object.keys(recipeSchemas)){
      if (!Object.prototype.hasOwnProperty.call(rawProgress, recipeId)) {
        continue;
      }
      const cleanProgress = sanitizeRecipeProgress(recipeId, rawProgress[recipeId]);
      progressRows.push({
        player_id: playerId,
        recipe_id: recipeId,
        progress: cleanProgress,
        updated_at: new Date().toISOString()
      });
    }
    // =====================================================
    // SAVE PLAYER CRAFTING STATE
    // =====================================================
    const { error: craftingError } = await ctx.supabaseAdmin.from("player_crafting").upsert({
      player_id: playerId,
      active_auto_craft: activeAutoCraft,
      updated_at: new Date().toISOString()
    }, {
      onConflict: "player_id"
    });
    if (craftingError) {
      console.error("Failed to migrate crafting state:", craftingError);
      return Response.json({
        error: "Failed to migrate crafting state."
      }, {
        status: 500
      });
    }
    // =====================================================
    // SAVE PROGRESS ROWS
    // =====================================================
    if (progressRows.length > 0) {
      const { error: progressError } = await ctx.supabaseAdmin.from("crafting_progress").upsert(progressRows, {
        onConflict: "player_id,recipe_id"
      });
      if (progressError) {
        console.error("Failed to migrate progress:", progressError);
        return Response.json({
          error: "Failed to migrate crafting progress."
        }, {
          status: 500
        });
      }
    }
    // =====================================================
    // MARK MIGRATION COMPLETE
    // =====================================================
    const { error: migrationFlagError } = await ctx.supabaseAdmin.from("players").update({
      crafting_migrated: true
    }).eq("id", playerId);
    if (migrationFlagError) {
      console.error("Failed to mark migration complete:", migrationFlagError);
      return Response.json({
        error: "Migration completed but flag update failed."
      }, {
        status: 500
      });
    }
    return Response.json({
      migrated: true,
      activeAutoCraft,
      recipeProgressRows: progressRows.length
    });
  })
};
