import {
  supabase,
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
} from "./supabase.js";


let lastAuthError =
  null;


// =========================================================
// GET LAST AUTH ERROR
// =========================================================

export function getLastAuthError() {
  return lastAuthError;
}


// =========================================================
// FETCH WITH TIMEOUT
// =========================================================

async function probeUrl(
  url
) {
  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      8000
    );


  try {
    const response =
      await fetch(
        url,
        {
          method:
            "GET",

          headers: {
            apikey:
              SUPABASE_PUBLISHABLE_KEY
          },

          signal:
            controller.signal
        }
      );


    return {
      reachable:
        true,

      status:
        response.status,

      message:
        null
    };
  } catch (error) {
    return {
      reachable:
        false,

      status:
        0,

      message:
        error?.message ??
        String(error)
    };
  } finally {
    clearTimeout(
      timeout
    );
  }
}


// =========================================================
// SUPABASE CONNECTIVITY DIAGNOSTICS
// =========================================================

async function checkSupabaseConnectivity() {
  const [
    restResult,
    authResult
  ] =
    await Promise.all([
      probeUrl(
        `${SUPABASE_URL}/rest/v1/`
      ),

      probeUrl(
        `${SUPABASE_URL}/auth/v1/settings`
      )
    ]);


  const diagnostics = {
    rest: {
      reachable:
        restResult.reachable,

      status:
        restResult.status,

      message:
        restResult.message
    },

    auth: {
      reachable:
        authResult.reachable,

      status:
        authResult.status,

      message:
        authResult.message
    }
  };


  console.log(
    "[AUTH] Supabase connectivity diagnostics:",
    diagnostics
  );


  return diagnostics;
}


// =========================================================
// AUTHENTICATE PLAYER
// =========================================================

export async function ensurePlayerAuth() {
  lastAuthError =
    null;


  console.log(
    "[AUTH] Checking existing session..."
  );


  // =======================================================
  // CHECK EXISTING SESSION
  // =======================================================

  const {
    data: sessionData,
    error: sessionError
  } =
    await supabase.auth
      .getSession();


  if (sessionError) {
    lastAuthError = {
      stage:
        "getSession",

      name:
        sessionError.name ??
        null,

      message:
        sessionError.message ??
        "Unknown session error.",

      status:
        sessionError.status ??
        null,

      code:
        sessionError.code ??
        null,

      diagnostics:
        null
    };


    console.error(
      "[AUTH] Failed to load Supabase session:",
      lastAuthError
    );


    return null;
  }


  // =======================================================
  // EXISTING USER
  // =======================================================

  if (
    sessionData.session?.user
  ) {
    console.log(
      "[AUTH] Existing session found:",
      sessionData.session.user.id
    );


    return (
      sessionData.session.user
    );
  }


  // =======================================================
  // NO SESSION
  // =======================================================

  console.log(
    "[AUTH] No session found."
  );


  console.log(
    "[AUTH] Testing Supabase connectivity..."
  );


  const diagnostics =
    await checkSupabaseConnectivity();


  // IMPORTANT:
  // We still attempt authentication even if a probe fails.
  //
  // The probes are diagnostic only and should never become
  // another condition that prevents a player from signing in.


  // =======================================================
  // CREATE ANONYMOUS USER
  // =======================================================

  console.log(
    "[AUTH] Creating anonymous user..."
  );


  const {
    data,
    error
  } =
    await supabase.auth
      .signInAnonymously();


  if (error) {
    lastAuthError = {
      stage:
        "signInAnonymously",

      name:
        error.name ??
        null,

      message:
        error.message ??
        "Unknown anonymous sign-in error.",

      status:
        error.status ??
        0,

      code:
        error.code ??
        null,

      diagnostics
    };


    console.error(
      "[AUTH] Anonymous sign-in failed:",
      lastAuthError
    );


    return null;
  }


  // =======================================================
  // MISSING USER
  // =======================================================

  if (!data.user) {
    lastAuthError = {
      stage:
        "signInAnonymously",

      name:
        "MissingUser",

      message:
        "Supabase returned no user after anonymous sign-in.",

      status:
        null,

      code:
        null,

      diagnostics
    };


    console.error(
      "[AUTH] Anonymous sign-in returned no user.",
      lastAuthError
    );


    return null;
  }


  // =======================================================
  // SUCCESS
  // =======================================================

  console.log(
    "[AUTH] Anonymous user created:",
    data.user.id
  );


  return data.user;
}
