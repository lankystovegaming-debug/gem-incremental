import {
  supabase
} from "./supabase.js";

import {
  ensurePlayerAuth
} from "./auth.js";

import {
  confirmDialog
} from "../ui/dialog.js";


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


  overlay.className = "dialog-overlay";
  overlay.id = "legacyMigrationOverlay";


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
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legacyMigrationTitle"
    >
      <h2 class="dialog__title" id="legacyMigrationTitle">
        We found an older save
      </h2>

      <div class="dialog__body">
        <p>
          This browser still holds progress from the version of
          the game that saved locally.
        </p>

        <div class="panel" style="margin-top:16px">
          <div class="stats-row-lite">
            <span>Money</span>
            <strong class="num">$${money.toFixed(2)}</strong>
          </div>

          <div class="stats-row-lite">
            <span>Total rolls</span>
            <strong class="num">${totalRolls.toLocaleString()}</strong>
          </div>

          <div class="stats-row-lite">
            <span>Gems stored</span>
            <strong class="num">${gemCount}</strong>
          </div>
        </div>

        <p style="margin-top:16px">
          Move it into your cloud save, or start over with a clean
          account. Your local save is not deleted either way.
        </p>

        <p id="legacyMigrationStatus" style="margin-top:12px"></p>
      </div>

      <div class="dialog__actions">
        <button class="btn" id="legacyFreshButton" type="button">
          Start fresh
        </button>

        <button class="btn btn--primary" id="legacyMigrateButton" type="button">
          Migrate my save
        </button>
      </div>
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


          localStorage.removeItem(
            FRESH_CHOICE_KEY
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
          const choice =
            await confirmDialog({
              title:
                "Start a new save?",

              body: `
                <p>
                  Your old local save is not deleted, but this
                  prompt will not appear again on this browser.
                </p>
              `,

              confirmLabel:
                "Start fresh",

              cancelLabel:
                "Go back"
            });


          if (choice !== "confirm") {
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
  if (
    localStorage.getItem(
      FRESH_CHOICE_KEY
    ) ===
    "fresh"
  ) {
    return {
      migrated:
        false,

      startedFresh:
        true
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
