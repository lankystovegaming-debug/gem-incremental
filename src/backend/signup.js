// A fetch failure has no HTTP response. Keep server errors (including rate
// limits and signup-policy rejections) out of the network retry path.
export function isSignupNetworkError(error) {
  if (!error || error.code || Number(error.status) > 0) return false;

  return error.name === "AuthRetryableFetchError" ||
    /^(failed to fetch|load failed|network request failed|networkerror.*)$/i.test(
      error.message ?? ""
    );
}

export function signupErrorMessage(error) {
  if (isSignupNetworkError(error)) {
    return "Could not connect to the account service. Check your internet connection and try again. If it keeps happening, try another network or check whether your browser or network blocks Supabase. If you already received a verification email, use that link, then log in.";
  }

  return error?.message || "Could not create account. Please try again.";
}

export async function signUpWithNetworkRetry(auth, credentials, onRetry) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let result;
    try {
      result = await auth.signUp(credentials);
    } catch (error) {
      if (!isSignupNetworkError(error)) throw error;
      result = { data: null, error };
    }

    if (!isSignupNetworkError(result.error) || attempt === 1 ||
        globalThis.navigator?.onLine === false) {
      return result;
    }

    // Reuse the SDK so PKCE, signup hooks, CAPTCHA, and email verification
    // still follow the project's normal authentication flow.
    onRetry?.();
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}
