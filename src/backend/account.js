import { supabase, loadEnabledProviders } from "./supabase.js";


// =========================================================
// ACCOUNT
//
// Players start as an anonymous guest. There are two ways to
// make that permanent, and both keep the same player id, so
// the save carries across untouched:
//
//   1. Email + password, on the Account page.
//   2. Google, by linking the identity to the guest user.
//
// An anonymous session is the ONLY key to an anonymous save.
// Nothing here may sign a guest out, or sign them into a
// different account, while that save still holds progress —
// there is no way back to it afterwards.
// =========================================================


export function isGuest(user) {
  if (!user) {
    return true;
  }

  if (user.is_anonymous === true) {
    return true;
  }

  return !user.email && (user.identities ?? []).length === 0;
}


export async function isGoogleEnabled() {
  const providers = await loadEnabledProviders();

  return providers.google === true;
}


export function describeAccount(user, username = null) {
  if (!user) {
    return {
      name: "Signing in...",
      detail: "",
      initials: "?",
      avatarUrl: null,
      guest: true
    };
  }

  if (isGuest(user)) {
    return {
      name: username || "Guest",
      detail: "Progress saved to this browser only",
      initials: username ? initialsFor(username) : "G",
      avatarUrl: null,
      guest: true
    };
  }

  const metadata = user.user_metadata ?? {};

  const name =
    username ||
    metadata.full_name ||
    metadata.name ||
    user.email?.split("@")[0] ||
    "Player";

  return {
    name,
    detail: user.email ?? "Signed in",
    initials: initialsFor(name),
    avatarUrl: metadata.avatar_url || metadata.picture || null,
    guest: false
  };
}


function initialsFor(name) {
  const parts = String(name).trim().split(/\s+/).slice(0, 2);

  const letters = parts
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return letters || "P";
}


// ---------------------------------------------------------
// PROGRESS CHECK
//
// Used to decide whether an action would strand a save.
// Errs on the side of "yes, there is progress": if the check
// itself fails, the destructive path stays closed.
// ---------------------------------------------------------

export async function hasProgress(user) {
  if (!user?.id) {
    return true;
  }

  const [playerResult, gemResult] = await Promise.all([
    supabase
      .from("players")
      .select("total_rolls")
      .eq("id", user.id)
      .maybeSingle(),

    supabase
      .from("inventory_gems")
      .select("id", { count: "exact", head: true })
  ]);

  if (playerResult.error || gemResult.error) {
    console.error("Could not check save progress:", {
      player: playerResult.error,
      gems: gemResult.error
    });

    return true;
  }

  return (
    Number(playerResult.data?.total_rolls ?? 0) > 0 ||
    Number(gemResult.count ?? 0) > 0
  );
}


function currentPageUrl() {
  return window.location.origin + window.location.pathname;
}


// ---------------------------------------------------------
// GOOGLE SIGN-IN
//
// Returns one of:
//   { started: true }            browser is redirecting
//   { blocked: "...", message }  refused, save would be lost
//   { started: false, message }  failed for another reason
// ---------------------------------------------------------

export async function signInWithGoogle() {
  if (!(await isGoogleEnabled())) {
    return {
      started: false,
      message: "Google sign-in is not enabled for this project."
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();

  const user = sessionData.session?.user ?? null;

  const options = {
    redirectTo: currentPageUrl(),
    queryParams: { prompt: "select_account" }
  };

  // Not a guest, or a guest with nothing to lose: a plain
  // sign-in is safe.
  if (!user || !isGuest(user)) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options
    });

    if (error) {
      console.error("Google sign-in failed:", error);

      return { started: false, message: describeAuthError(error) };
    }

    return { started: true };
  }

  // A guest: attach Google to the existing user so the save
  // comes with it.
  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    options
  });

  if (!error) {
    return { started: true };
  }

  console.error("Could not link Google identity:", error);

  // Linking failed. Signing in normally from here would swap
  // the session for a different account and strand this save,
  // so that path is only open when there is nothing to strand.
  if (await hasProgress(user)) {
    return {
      blocked: "would_lose_progress",
      started: false,
      message: describeAuthError(error)
    };
  }

  const { error: fallbackError } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options
  });

  if (fallbackError) {
    return {
      started: false,
      message: describeAuthError(fallbackError)
    };
  }

  return { started: true };
}


function describeAuthError(error) {
  const message = String(error?.message ?? "").toLowerCase();

  if (message.includes("manual linking") || message.includes("not enabled")) {
    return "Account linking is turned off for this project.";
  }

  if (message.includes("already") || error?.code === "identity_already_exists") {
    return "That Google account is already linked to another save.";
  }

  if (message.includes("provider is not enabled")) {
    return "Google sign-in is not enabled for this project yet.";
  }

  return error?.message ?? "Google sign-in failed.";
}


// ---------------------------------------------------------
// SIGN OUT
//
// Refuses for anonymous users: their session is the only way
// back to their save.
// ---------------------------------------------------------

export async function signOutAccount() {
  const { data } = await supabase.auth.getSession();

  const user = data.session?.user ?? null;

  if (user && isGuest(user)) {
    return {
      ok: false,
      reason: "guest",
      message:
        "A guest save can only be reached from this browser session. " +
        "Create an account before signing out."
    };
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Sign-out failed:", error);

    return { ok: false, reason: "error", message: error.message };
  }

  return { ok: true };
}


// ---------------------------------------------------------
// SESSION EVENTS
// ---------------------------------------------------------

export function onAccountChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    // This runs while the auth client holds its internal lock.
    // Anything awaiting a Supabase request here would deadlock,
    // so callbacks must stay synchronous.
    callback(event, session?.user ?? null);
  });

  return () => data.subscription.unsubscribe();
}


// ---------------------------------------------------------
// USERNAME
//
// Shown on leaderboards; also the friendliest label for the
// account menu.
// ---------------------------------------------------------

export async function loadUsername(userId) {
  if (!userId) {
    return null;
  }

  const { data, error } = await supabase
    .from("players")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Could not load username:", error);

    return null;
  }

  return data?.username ?? null;
}
