import {
  supabase
} from "./supabase.js";

import {
  ensurePlayerAuth
} from "./auth.js";


const LEGACY_KEYS = {
  player:
    "gemIncrementalPlayer",

  inventory:
    "gemIncrementalInventory",

  crafting:
    "gemIncrementalCrafting"
};


const FRESH_CHOICE_KEY =
  "gemIncrementalLegacyMigrationChoice";


// =========================================================
// READ LEGACY SAVE
// =========================================================

function readJson(
  key
) {
  const raw =
    localStorage.getItem(
      key
    );


  if (!raw) {
    return null;
  }


  try {
    return JSON.parse(
      raw
    );
  } catch {
    return null;
  }
}


function readLegacySave() {
  return {
    player:
      readJson(
        LEGACY_KEYS.player
      ),

    inventory:
      readJson(
        LEGACY_KEYS.inventory
      ),

    crafting:
      readJson(
        LEGACY_KEYS.crafting
      )
  };
}


function hasCompleteLegacySave(
  save
) {
  return Boolean(
    save.player &&
    save.inventory &&
    save.crafting
  );
}


// =========================================================
// CLOUD STATUS
// =========================================================

async function loadCloudMigrationStatus(
  playerId
) {
  const [
    playerResult,
    inventoryResult,
    equipmentResult,
    craftingResult
  ] =
    await Promise.all([
      supabase
        .from("players")
        .select(`
          legacy_save_migrated,
          total_rolls
        `)
        .eq(
          "id",
          playerId
        )
        .maybeSingle(),

      supabase
        .from(
          "inventory_gems"
        )
        .select(
          "id",
          {
            count: "exact",
            head: true
          }
        ),

      supabase
        .from(
          "player_equipment"
        )
        .select(
          "id",
          {
            count: "exact",
            head: true
          }
        ),

      supabase
        .from(
          "crafting_progress"
        )
        .select(
          "recipe_id",
          {
            count: "exact",
            head: true
          }
        )
    ]);


  if (
    playerResult.error ||
    inventoryResult.error ||
    equipmentResult.error ||
    craftingResult.error
  ) {
    console.error(
      "Could not check migration status:",
      {
        player:
          playerResult.error,

        inventory:
          inventoryResult.error,

        equipment:
          equipmentResult.error,

        crafting:
          craftingResult.error
      }
    );


    return null;
  }


  const player =
    playerResult.data;


  const alreadyMigrated =
    player
      ?.legacy_save_migrated ===
    true;


  const hasCloudProgress =
    Number(
      player?.total_rolls ??
      0
    ) > 0 ||
    Number(
      inventoryResult.count ??
      0
    ) > 0 ||
    Number(
      equipmentResult.count ??
      0
    ) > 0 ||
    Number(
      craftingResult.count ??
      0
    ) > 0;


  return {
    alreadyMigrated,
    hasCloudProgress
  };
}


// =========================================================
// MODAL
// =========================================================

function createMigrationModal(
  legacySave
) {
  const overlay =
    document.createElement(
      "div"
    );


  overlay.id =
    "legacyMigrationOverlay";


  const totalRolls =
    Number(
      legacySave
        .player
        ?.stats
        ?.totalRolls ??
      0
    );


  const money =
    Number(
      legacySave
        .player
        ?.money ??
      0
    );


  const gemCount =
    Array.isArray(
      legacySave
        .inventory
        ?.gems
    )
      ? legacySave
          .inventory
          .gems
          .length
      : 0;


  overlay.innerHTML = `
    <div class="legacy-migration-modal">
      <h2>
        Existing Save Detected
      </h2>

      <p>
        We found progress from the previous
        version of the game.
      </p>

      <div class="legacy-migration-summary">
        <p>
          Money:
          $${money.toFixed(2)}
        </p>

        <p>
          Total Rolls:
          ${totalRolls.toLocaleString()}
        </p>

        <p>
          Inventory Gems:
          ${gemCount}
        </p>
      </div>

      <p class="legacy-migration-note">
        You can migrate this progress into
        the new cloud save, or start fresh.
      </p>

      <div class="legacy-migration-actions">
        <button
          id="legacyMigrateButton"
          type="button"
        >
          Migrate Save
        </button>

        <button
          id="legacyFreshButton"
          type="button"
        >
          Start Fresh
        </button>
      </div>

      <p
        id="legacyMigrationStatus"
        class="legacy-migration-status"
      ></p>
    </div>
  `;


  document.body.appendChild(
    overlay
  );


  return overlay;
}


// =========================================================
// SHOW MIGRATION CHOICE
// =========================================================

function showMigrationChoice(
  legacySave
) {
  return new Promise(
    (resolve) => {
      const overlay =
        createMigrationModal(
          legacySave
        );


      const migrateButton =
        overlay.querySelector(
          "#legacyMigrateButton"
        );


      const freshButton =
        overlay.querySelector(
          "#legacyFreshButton"
        );


      const status =
        overlay.querySelector(
          "#legacyMigrationStatus"
        );


      // ===============================================
      // MIGRATE
      // ===============================================

      migrateButton.addEventListener(
        "click",
        async () => {
          migrateButton.disabled =
            true;

          freshButton.disabled =
            true;


          status.textContent =
            "Migrating save...";


          const {
            data,
            error
          } =
            await supabase
              .functions
              .invoke(
                "migrate-save",
                {
                  body:
                    legacySave
                }
              );


          if (error) {
            console.error(
              "Legacy migration failed:",
              error
            );


            let message =
              error.message ??
              "Migration failed.";


            try {
              if (
                error.context &&
                typeof error
                  .context
                  .json ===
                "function"
              ) {
                const response =
                  await error
                    .context
                    .json();


                message =
                  response.error ??
                  message;
              }
            } catch {
              // Use original error message.
            }


            status.textContent =
              `Migration failed: ${message}`;


            migrateButton.disabled =
              false;

            freshButton.disabled =
              false;


            return;
          }


          console.log(
            "Legacy migration complete:",
            data
          );


          localStorage.setItem(
            FRESH_CHOICE_KEY,
            "migrated"
          );


          status.textContent =
            "Save migrated successfully!";


          setTimeout(
            () => {
              overlay.remove();


              resolve({
                migrated:
                  true,

                startedFresh:
                  false
              });
            },
            700
          );
        }
      );


      // ===============================================
      // START FRESH
      // ===============================================

      freshButton.addEventListener(
        "click",
        async () => {
          const confirmed =
            window.confirm(
              "Start a new cloud save instead?\n\nYour old local save will NOT be deleted, but this migration prompt will no longer appear on this browser."
            );


          if (!confirmed) {
            return;
          }


          migrateButton.disabled =
            true;

          freshButton.disabled =
            true;


          status.textContent =
            "Creating fresh cloud save...";


          const user =
            await ensurePlayerAuth();


          if (!user) {
            status.textContent =
              "Could not authenticate player.";


            migrateButton.disabled =
              false;

            freshButton.disabled =
              false;


            return;
          }


          // =================================================
          // ENSURE PLAYER ROW EXISTS
          // =================================================

          const {
            error: playerCreateError
          } =
            await supabase
              .from("players")
              .upsert(
                {
                  id:
                    user.id
                },
                {
                  onConflict:
                    "id",

                  ignoreDuplicates:
                    true
                }
              );


          if (playerCreateError) {
            console.error(
              "Could not create fresh player:",
              playerCreateError
            );


            status.textContent =
              "Could not create fresh cloud save.";


            migrateButton.disabled =
              false;

            freshButton.disabled =
              false;


            return;
          }


          // =================================================
          // REMEMBER PLAYER CHOSE FRESH
          // =================================================

          localStorage.setItem(
            FRESH_CHOICE_KEY,
            "fresh"
          );


          overlay.remove();


          resolve({
            migrated:
              false,

            startedFresh:
              true
          });
        }
      );
    }
  );
}


// =========================================================
// PUBLIC STARTUP GATE
// =========================================================

export async function runLegacyMigrationGate() {
  const user =
    await ensurePlayerAuth();


  if (!user) {
    console.error(
      "Could not authenticate player before migration check."
    );


    return {
      migrated:
        false,

      startedFresh:
        false
    };
  }


  // Player explicitly chose a new save
  // on this browser.
  const migrationChoice =
    localStorage.getItem(
      FRESH_CHOICE_KEY
    );
  
  
  if (
    migrationChoice ===
      "fresh" ||
    migrationChoice ===
      "migrated"
  ) {
    return {
      migrated:
        migrationChoice ===
          "migrated",
  
      startedFresh:
        migrationChoice ===
          "fresh"
    };
  }


  const legacySave =
    readLegacySave();


  if (
    !hasCompleteLegacySave(
      legacySave
    )
  ) {
    return {
      migrated:
        false,

      startedFresh:
        false
    };
  }


  const cloudStatus =
    await loadCloudMigrationStatus(
      user.id
    );


  if (!cloudStatus) {
    return {
      migrated:
        false,

      startedFresh:
        false
    };
  }


  if (
    cloudStatus.alreadyMigrated
  ) {
    return {
      migrated:
        false,

      startedFresh:
        false
    };
  }


  if (
    cloudStatus.hasCloudProgress
  ) {
    return {
      migrated:
        false,

      startedFresh:
        false
    };
  }


  return await showMigrationChoice(
    legacySave
  );
}
