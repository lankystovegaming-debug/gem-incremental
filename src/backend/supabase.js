import {
  createClient
} from "https://esm.sh/@supabase/supabase-js@2";


export const SUPABASE_URL =
  "https://fuzidbblwzrhhbonjqjm.supabase.co";


export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_sCiiZxMP5DG8_gjGLg9qUg_HnWVD27U";


export const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession:
          true,

        autoRefreshToken:
          true,

        // Email verification and OAuth both hand the session
        // back on the URL, so the client has to read it on load.
        detectSessionInUrl:
          true,

        flowType:
          "pkce"
      }
    }
  );


// =========================================================
// ENABLED AUTH PROVIDERS
//
// Which sign-in methods exist is a project setting, not
// something the client can know. Asking the auth service lets
// the interface offer only the methods that actually work,
// instead of showing a button that fails when a provider has
// not been configured.
// =========================================================

let providerPromise = null;


export function loadEnabledProviders() {
  if (!providerPromise) {
    providerPromise = fetchProviders().catch((error) => {
      console.error(
        "Could not read enabled auth providers:",
        error
      );

      providerPromise = null;

      return {};
    });
  }

  return providerPromise;
}


async function fetchProviders() {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/settings`,
    {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY
      }
    }
  );

  if (!response.ok) {
    return {};
  }

  const settings = await response.json();

  return settings?.external ?? {};
}
