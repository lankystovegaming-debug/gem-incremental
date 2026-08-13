import recipes
  from "./src/data/recipes.js";

import {
  ensurePlayerAuth,
  getLastAuthError
} from "./src/backend/auth.js";

import {
  ensureCloudPlayer
} from "./src/backend/playerCloud.js";

import {
  supabase
} from "./src/backend/supabase.js";

import {
  runLegacyMigrationGate
} from "./src/backend/legacyMigration.js";


const rollButton =
  document.getElementById(
    "rollButton"
  );

const result =
  document.getElementById(
    "result"
  );

let cooldownTimer =
  null;


// =========================================================
// LOAD SERVER ROLL STATE
// =========================================================

async function loadServerRollState(userId) {
  const [
    playerResult,
    inventoryResult
  ] =
    await Promise.all([
      supabase
        .from("players")
        .select(`
          inventory_capacity,
          next_roll_at
        `)
        .eq(
          "id",
          userId
        )
        .maybeSingle(),

      supabase
        .from("inventory_gems")
        .select(
          "id",
          {
            count: "exact",
            head: true
          }
        )
    ]);


  if (playerResult.error) {
    console.error(
      "Failed to load player roll state:",
      playerResult.error
    );

    return null;
  }


  if (inventoryResult.error) {
    console.error(
      "Failed to load inventory count:",
      inventoryResult.error
    );

    return null;
  }


  // A completely fresh anonymous user may not
  // have a row in public.players yet.
  if (!playerResult.data) {
    return {
      capacity:
        15,

      nextRollAt:
        null,

      inventoryCount:
        inventoryResult.count ??
        0
    };
  }


  return {
    capacity:
      Number(
        playerResult.data
          .inventory_capacity ??
        15
      ),

    nextRollAt:
      playerResult.data
        .next_roll_at,

    inventoryCount:
      inventoryResult.count ??
      0
  };
}


// =========================================================
// READY BUTTON
// =========================================================

async function showReadyButton() {
  const {
  data: {
    user
  }
} =
  await supabase.auth.getUser();

const state =
  await loadServerRollState(
    user?.id
  );


  if (!state) {
    rollButton.disabled =
      true;

    rollButton.textContent =
      "ERROR";

    return;
  }


  if (
    state.inventoryCount >=
    state.capacity
  ) {
    rollButton.disabled =
      true;

    rollButton.textContent =
      "INVENTORY FULL";

    return;
  }


  rollButton.disabled =
    false;

  rollButton.textContent =
    "ROLL";
}


// =========================================================
// COOLDOWN DISPLAY
// =========================================================

function startCooldown(
  cooldownEnd
) {
  if (cooldownTimer) {
    clearInterval(
      cooldownTimer
    );
  }


  rollButton.disabled =
    true;


  function updateCooldown() {
    const remaining =
      cooldownEnd -
      Date.now();


    if (
      remaining <= 0
    ) {
      clearInterval(
        cooldownTimer
      );

      cooldownTimer =
        null;


      showReadyButton();

      return;
    }


    rollButton.textContent =
      `ROLL (${(
        remaining /
        1000
      ).toFixed(1)}s)`;
  }


  updateCooldown();


  cooldownTimer =
    setInterval(
      updateCooldown,
      100
    );
}


// =========================================================
// RESTORE SERVER STATE
// =========================================================

async function restoreGameState() {
  const {
  data: {
    user
  }
} =
  await supabase.auth.getUser();

const state =
  await loadServerRollState(
    user?.id
  );


  if (!state) {
    rollButton.disabled =
      true;

    rollButton.textContent =
      "ERROR";

    return;
  }


  if (
    state.nextRollAt
  ) {
    const cooldownEnd =
      new Date(
        state.nextRollAt
      ).getTime();


    if (
      cooldownEnd >
      Date.now()
    ) {
      startCooldown(
        cooldownEnd
      );

      return;
    }
  }


  await showReadyButton();
}


// =========================================================
// SERVER ROLL
// =========================================================

async function performServerRoll() {
  rollButton.disabled =
    true;

  rollButton.textContent =
    "ROLLING...";


  const {
    data,
    error
  } =
    await supabase
      .functions
      .invoke(
        "roll"
      );


  // =======================================================
  // HANDLE SERVER ERROR
  // =======================================================

  if (error) {
    console.error(
      "Server roll failed:",
      error
    );


    if (
      error.name ===
      "FunctionsHttpError"
    ) {
      try {
        const details =
          await error.context
            .json();


        console.error(
          "Server response:",
          details
        );


        // ---------------------------------
        // COOLDOWN
        // ---------------------------------

        if (
          details.error ===
          "cooldown"
        ) {
          if (
            details.nextRollAt
          ) {
            startCooldown(
              new Date(
                details.nextRollAt
              ).getTime()
            );
          }

          return;
        }


        // ---------------------------------
        // INVENTORY FULL
        // ---------------------------------

        if (
          details.error ===
          "inventory_full"
        ) {
          rollButton.disabled =
            true;

          rollButton.textContent =
            "INVENTORY FULL";

          return;
        }
      } catch (
        parseError
      ) {
        console.error(
          "Could not read server error:",
          parseError
        );
      }
    }


    rollButton.disabled =
      false;

    rollButton.textContent =
      "ROLL";

    return;
  }


  if (!data) {
    console.error(
      "Server returned no roll."
    );

    await showReadyButton();

    return;
  }


  // =======================================================
  // NORMALIZE SERVER RESULT
  // =======================================================

  const rolled = {
    gem: {
      name:
        data.gem.name,

      rarity:
        data.gem.rarity,

      baseWeight:
        data.gem.baseWeight,

      valuePerGram:
        data.gem.valuePerGram
    },

    weightMultiplier:
      data.weightMultiplier,

    rolledWeight:
      data.rolledWeight,

    finalWeight:
      data.finalWeight,

    value:
      data.value
  };


  // =======================================================
  // DISPLAY RESULT
  // =======================================================

  const autoDeposited =
    data.autoCraft?.deposited ===
    true;


  const autoCraftRecipe =
    autoDeposited
      ? recipes.find(
          (recipe) =>
            recipe.id ===
            data.autoCraft.recipeId
        )
      : null;


  const autoCraftName =
    autoCraftRecipe?.name ??
    data.autoCraft?.recipeId ??
    "crafting";


  result.innerHTML = `
    <h2>
      ${rolled.gem.name}
    </h2>

    <p>
      Rarity:
      1 in
      ${rolled.gem.rarity.toLocaleString()}
    </p>

    <p>
      Weight:
      ${rolled.finalWeight.toFixed(2)}g
      (${rolled.weightMultiplier.toFixed(3)}x)
    </p>

    <p>
      Value:
      $${rolled.value.toFixed(2)}
    </p>

    ${
      autoDeposited
        ? `
          <p>
            Auto-deposited into
            <strong>${autoCraftName}</strong>.
          </p>
        `
        : `
          <p>
            Inventory:
            ${data.inventory.count}
            /
            ${data.inventory.capacity}
          </p>
        `
    }
  `;


  // =======================================================
  // SERVER COOLDOWN
  // =======================================================

  if (
    data.cooldown
      ?.nextRollAt
  ) {
    startCooldown(
      new Date(
        data.cooldown
          .nextRollAt
      ).getTime()
    );
  } else {
    await showReadyButton();
  }
}


// =========================================================
// ROLL BUTTON
// =========================================================

rollButton.addEventListener(
  "click",
  async (event) => {
    if (!event.isTrusted) {
      return;
    }


    await performServerRoll();
  }
);


// =========================================================
// START GAME
// =========================================================

async function startGame() {
  rollButton.disabled =
    true;

  rollButton.textContent =
    "LOADING...";


  // =================================
  // AUTH
  // =================================

  const user =
    await ensurePlayerAuth();


  if (!user) {
    const authError =
      getLastAuthError();


    rollButton.disabled =
      true;

    rollButton.textContent =
      "AUTH ERROR";


    result.innerHTML = `
      <h2>
        Authentication Error
      </h2>
    
      <p>
        Could not authenticate player.
      </p>
    
      ${
        authError
          ?.diagnostics &&
        !authError
          .diagnostics
          .rest
          .reachable &&
        !authError
          .diagnostics
          .auth
          .reachable
          ? `
            <hr>
    
            <h3>
              Backend Connection Blocked
            </h3>
    
            <p>
              This device could not connect
              to the game's backend.
            </p>
    
            <p>
              If you are using a managed
              school or work device, access
              to the required backend domain
              may be restricted.
            </p>
    
            <p>
              Try using Gem Incremental on
              another unrestricted device.
            </p>
          `
          : ""
      }
    
      ${
        authError
          ? `
            <hr>
    
            <p>
              <strong>Stage:</strong>
              ${authError.stage ?? "Unknown"}
            </p>
    
            <p>
              <strong>Status:</strong>
              ${authError.status ?? "Unknown"}
            </p>
    
            <p>
              <strong>Code:</strong>
              ${authError.code ?? "Unknown"}
            </p>
    
            <p>
              <strong>Message:</strong>
              ${authError.message ?? "Unknown error"}
            </p>
    
    
            ${
              authError.diagnostics
                ? `
                  <hr>
    
                  <h3>
                    Connection Test
                  </h3>
    
                  <p>
                    <strong>
                      Supabase REST:
                    </strong>
    
                    ${
                      authError
                        .diagnostics
                        .rest
                        .reachable
                        ? `REACHABLE (${authError.diagnostics.rest.status})`
                        : "FAILED"
                    }
                  </p>
    
                  <p>
                    <strong>
                      Supabase Auth:
                    </strong>
    
                    ${
                      authError
                        .diagnostics
                        .auth
                        .reachable
                        ? `REACHABLE (${authError.diagnostics.auth.status})`
                        : "FAILED"
                    }
                  </p>
    
    
                  ${
                    !authError
                      .diagnostics
                      .rest
                      .reachable
                      ? `
                        <p>
                          <strong>
                            REST Error:
                          </strong>
    
                          ${
                            authError
                              .diagnostics
                              .rest
                              .message ??
                            "Unknown"
                          }
                        </p>
                      `
                      : ""
                  }
    
    
                  ${
                    !authError
                      .diagnostics
                      .auth
                      .reachable
                      ? `
                        <p>
                          <strong>
                            Auth Error:
                          </strong>
    
                          ${
                            authError
                              .diagnostics
                              .auth
                              .message ??
                            "Unknown"
                          }
                        </p>
                      `
                      : ""
                  }
                `
                : ""
            }
          `
          : `
            <p>
              No additional error information
              was provided.
            </p>
          `
      }
    `;

    return;
  }


  // =================================
  // ENSURE CLOUD PLAYER ROW
  // =================================
  // A freshly authenticated user (especially anonymous)
  // may not have a row in public.players yet. The roll
  // edge function requires one to exist, so create/load
  // it here before anything else touches player data.

  const cloudPlayer =
    await ensureCloudPlayer(
      user
    );


  if (!cloudPlayer) {
    rollButton.disabled =
      true;

    rollButton.textContent =
      "ERROR";

    result.innerHTML = `
      <h2>
        Player Setup Failed
      </h2>

      <p>
        Could not create or load your
        player record. Please refresh
        and try again.
      </p>
    `;

    return;
  }


  // =================================
  // LEGACY MIGRATION GATE
  // =================================

  try {
    await runLegacyMigrationGate();
  } catch (error) {
    console.error(
      "Legacy migration gate failed:",
      error
    );


    rollButton.disabled =
      true;

    rollButton.textContent =
      "ERROR";


    result.innerHTML = `
      <p>
        Could not check save migration status.
      </p>
    `;


    return;
  }


  // =================================
  // LOAD CLOUD GAME STATE
  // =================================

  await restoreGameState();
}

// =========================================================
// INITIAL START
// =========================================================

startGame();
