import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import {
  isSignupNetworkError,
  signupErrorMessage,
  signUpWithNetworkRetry
} from "../src/backend/signup.js";

const networkError = {
  name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch"
};
const credentials = { email: "signup@example.test", password: "test-password" };

test("a temporary fetch failure retries once using the same SDK and credentials", async () => {
  let calls = 0;
  let retries = 0;
  const success = { data: { session: null, user: { id: "new-user" } }, error: null };
  const auth = { async signUp(value) {
    assert.equal(value, credentials);
    return ++calls === 1 ? { data: null, error: networkError } : success;
  } };
  assert.equal(await signUpWithNetworkRetry(auth, credentials, () => retries++), success);
  assert.equal(calls, 2);
  assert.equal(retries, 1);
});

test("persistent thrown fetch failures stop after one retry and explain recovery", async () => {
  let calls = 0;
  const auth = { async signUp() { calls++; throw new TypeError("Failed to fetch"); } };
  const result = await signUpWithNetworkRetry(auth, credentials);
  assert.equal(calls, 2);
  assert.match(signupErrorMessage(result.error), /another network/);
  assert.match(signupErrorMessage(result.error), /verification email/);
});

test("server responses, validation errors and unknown exceptions are never retried", async () => {
  for (const error of [
    { name: "AuthApiError", status: 422, code: "email_exists", message: "Email exists" },
    { name: "AuthApiError", status: 429, message: "Too many requests" },
    { name: "AuthRetryableFetchError", status: 503, message: "Service unavailable" },
    { code: "hook_rejected", message: "Failed to fetch" }
  ]) {
    let calls = 0;
    const result = await signUpWithNetworkRetry({ async signUp() {
      calls++; return { data: null, error };
    } }, credentials);
    assert.equal(calls, 1);
    assert.equal(result.error, error);
    assert.equal(signupErrorMessage(error), error.message);
  }
  let calls = 0;
  await assert.rejects(signUpWithNetworkRetry({ async signUp() {
    calls++; throw new Error("Unexpected failure");
  } }, credentials), /Unexpected failure/);
  assert.equal(calls, 1);
  for (const message of ["Load failed", "Network request failed", "NetworkError when attempting to fetch resource."]) {
    assert.equal(isSignupNetworkError({ message }), true);
  }
});

const accountSource = readFileSync(new URL("../account/account.js", import.meta.url), "utf8");
const handlerSource = accountSource.slice(
  accountSource.indexOf("async function createAccount()"),
  accountSource.indexOf("// PASSWORD RESET REQUEST")
);

function accountHarness(signup) {
  const elements = {
    createEmail: { value: " signup@example.test " },
    createPassword: { value: "test-password" },
    createPasswordConfirmation: { value: "test-password" },
    createAccountSubmitButton: { disabled: false },
    backToLoginButton: { disabled: false }
  };
  const statuses = [];
  let renders = 0;
  const context = vm.createContext({
    document: { getElementById: (id) => elements[id] },
    setStatus: (message, error = false) => statuses.push({ message, error }),
    supabase: { auth: {} },
    signUpWithNetworkRetry: signup,
    signupErrorMessage,
    accountPageUrl: () => "https://example.test/account/",
    renderAccount: async () => { renders++; },
    console: { error() {} }
  });
  vm.runInContext(`let creatingAccount = false; ${handlerSource}`, context);
  return { elements, statuses, run: () => context.createAccount(), renders: () => renders };
}

test("duplicate clicks are ignored, SDK options survive, and verification is not reported as login", async () => {
  let resolve;
  let calls = 0;
  const ui = accountHarness(async (_auth, options) => {
    calls++;
    assert.equal(options.email, "signup@example.test");
    assert.equal(options.options.emailRedirectTo, "https://example.test/account/");
    assert.equal(options.options.data.gem_incremental_password_set, true);
    return new Promise((done) => { resolve = done; });
  });
  const pending = ui.run();
  assert.equal(ui.elements.createAccountSubmitButton.disabled, true);
  assert.equal(ui.elements.backToLoginButton.disabled, true);
  await ui.run();
  assert.equal(calls, 1);
  resolve({ data: { session: null }, error: null });
  await pending;
  assert.match(ui.statuses.at(-1).message, /Check your inbox/);
  assert.equal(ui.renders(), 0);
  assert.equal(ui.elements.createAccountSubmitButton.disabled, false);
  assert.equal(ui.elements.backToLoginButton.disabled, false);
});

test("returned and thrown failures release controls, retain inputs and allow another attempt", async () => {
  for (const throws of [false, true]) {
    const ui = accountHarness(async () => {
      if (throws) throw networkError;
      return { data: null, error: networkError };
    });
    await ui.run();
    assert.equal(ui.statuses.at(-1).error, true);
    assert.match(ui.statuses.at(-1).message, /Could not connect/);
    assert.equal(ui.elements.createAccountSubmitButton.disabled, false);
    assert.equal(ui.elements.backToLoginButton.disabled, false);
    assert.equal(ui.elements.createPassword.value, "test-password");
    await ui.run();
  }
});

test("validation remains local and an authenticated signup still opens the account", async () => {
  let calls = 0;
  const ui = accountHarness(async () => {
    calls++; return { data: { session: { user: { id: "new-user" } } }, error: null };
  });
  ui.elements.createPasswordConfirmation.value = "mismatch";
  await ui.run();
  assert.equal(calls, 0);
  assert.equal(ui.statuses.at(-1).message, "Passwords do not match.");
  ui.elements.createPasswordConfirmation.value = "test-password";
  await ui.run();
  assert.equal(ui.renders(), 1);
  assert.equal(ui.statuses.at(-1).message, "Account created successfully.");
});
