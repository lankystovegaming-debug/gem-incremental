import {
  supabase
} from "../src/backend/supabase.js";


const accountCard =
  document.getElementById(
    "accountCard"
  );

const accountStatus =
  document.getElementById(
    "accountStatus"
  );

const AVATAR_BUCKET =
  "avatars";

const MAX_AVATAR_BYTES =
  2 * 1024 * 1024;

const AVATAR_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);


let currentGuestUser =
  null;

let passwordRecoveryMode =
  new URLSearchParams(
    window.location.search
  ).get(
    "reset"
  ) === "1";

let avatarPreviewUrl =
  null;


// =========================================================
// STATUS
// =========================================================

function setStatus(
  message,
  isError = false
) {
  accountStatus.textContent =
    message;

  accountStatus.classList.toggle(
    "error",
    isError
  );
}


// =========================================================
// ESCAPE HTML
// =========================================================

function escapeHtml(
  value
) {
  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


// =========================================================
// USERNAME
// =========================================================

async function loadUsername(
  userId
) {
  const {
    data,
    error
  } =
    await supabase
      .from(
        "players"
      )
      .select(
        "username"
      )
      .eq(
        "id",
        userId
      )
      .maybeSingle();


  if (error) {
    console.error(
      "Could not load username:",
      error
    );

    return null;
  }


  return (
    data?.username ??
    null
  );
}


function usernameSection(
  username
) {
  const hasUsername =
    Boolean(
      username
    );


  return `
    <hr>

    <h3>
      Username
    </h3>

    ${
      hasUsername
        ? `
          <p>
            Your current username is:
          </p>

          <div class="account-info">
            <p>
              <strong>
                ${escapeHtml(
                  username
                )}
              </strong>
            </p>
          </div>

          <p>
            Change Username
          </p>
        `
        : `
          <p>
            Choose a public username
            for leaderboards.
          </p>
        `
    }

    <label>
      Username

      <input
        id="usernameInput"
        type="text"
        maxlength="20"
        autocomplete="off"
        value="${escapeHtml(
          username ??
          ""
        )}"
        placeholder="Username"
      >
    </label>

    <p class="account-note">
      3–20 characters.
      Letters, numbers and underscores only.
    </p>

    <button
      id="saveUsernameButton"
      type="button"
    >
      ${
        hasUsername
          ? "Change Username"
          : "Save Username"
      }
    </button>
  `;
}


// =========================================================
// PROFILE PICTURE
// =========================================================

function profilePictureSection(
  user
) {
  const avatarUrl =
    user.user_metadata
      ?.avatar_url ??
    null;

  return `
    <hr>

    <h3>
      Profile Picture
    </h3>

    <div class="profile-picture">
      <div class="profile-picture__preview" id="avatarPreview">
        ${
          avatarUrl
            ? `<img src="${escapeHtml(
                avatarUrl
              )}" alt="Current profile picture">`
            : '<span aria-hidden="true">?</span>'
        }
      </div>

      <div>
        <p>
          Upload a square image for your account menu.
        </p>

        <label>
          Image

          <input
            id="avatarInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
          >
        </label>

        <p class="account-note">
          JPG, PNG, or WebP. Maximum size: 2 MB.
        </p>

        <button
          id="saveAvatarButton"
          type="button"
        >
          Save Picture
        </button>
      </div>
    </div>
  `;
}


function attachProfilePictureListener(
  user
) {
  const input =
    document.getElementById(
      "avatarInput"
    );

  const button =
    document.getElementById(
      "saveAvatarButton"
    );

  input?.addEventListener(
    "change",
    previewProfilePicture
  );

  button?.addEventListener(
    "click",
    () => uploadProfilePicture(user)
  );
}


function accountPageUrl() {
  // Resolve from the current document instead of the domain root. The game
  // can be hosted below a path (for example /gem-incremental/ on GitHub
  // Pages), where `${origin}/account/` points at the wrong application.
  const url =
    new URL(
      "./",
      window.location.href
    );

  url.search = "";
  url.hash = "";

  return url.href;
}


function clearPasswordRecoveryMode() {
  passwordRecoveryMode =
    false;

  const cleanUrl =
    new URL(
      window.location.href
    );

  cleanUrl.searchParams.delete(
    "reset"
  );

  cleanUrl.hash =
    "";

  window.history.replaceState(
    {},
    document.title,
    `${cleanUrl.pathname}${cleanUrl.search}`
  );
}


function avatarValidationMessage(
  file
) {
  if (!file) {
    return "Choose an image first.";
  }

  if (!AVATAR_TYPES.has(file.type)) {
    return "Choose a JPG, PNG, or WebP image.";
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return "Profile pictures must be 2 MB or smaller.";
  }

  return null;
}


function previewProfilePicture() {
  const input =
    document.getElementById(
      "avatarInput"
    );

  const file =
    input?.files?.[0] ??
    null;

  const validationError =
    avatarValidationMessage(file);

  if (validationError) {
    setStatus(validationError, true);

    return;
  }

  if (avatarPreviewUrl) {
    URL.revokeObjectURL(avatarPreviewUrl);
  }

  avatarPreviewUrl =
    URL.createObjectURL(file);

  const preview =
    document.getElementById(
      "avatarPreview"
    );

  if (preview) {
    preview.innerHTML = `<img src="${escapeHtml(
      avatarPreviewUrl
    )}" alt="Selected profile picture preview">`;
  }
}


async function uploadProfilePicture(
  user
) {
  const input =
    document.getElementById(
      "avatarInput"
    );

  const file =
    input?.files?.[0] ??
    null;

  const validationError =
    avatarValidationMessage(file);

  if (validationError) {
    setStatus(validationError, true);

    return;
  }

  setStatus(
    "Uploading profile picture..."
  );

  const objectPath =
    `${user.id}/avatar`;

  const {
    error: uploadError
  } =
    await supabase.storage
      .from(
        AVATAR_BUCKET
      )
      .upload(
        objectPath,
        file,
        {
          cacheControl: "31536000",
          contentType: file.type,
          upsert: true
        }
      );

  if (uploadError) {
    console.error(
      "Profile picture upload failed:",
      uploadError
    );

    setStatus(
      uploadError.message ??
      "Could not upload profile picture.",
      true
    );

    return;
  }

  const {
    data: urlData
  } =
    supabase.storage
      .from(
        AVATAR_BUCKET
      )
      .getPublicUrl(
        objectPath
      );

  const avatarUrl =
    `${urlData.publicUrl}?v=${Date.now()}`;

  const {
    error: profileError
  } =
    await supabase.auth
      .updateUser({
        data: {
          ...(
            user.user_metadata ??
            {}
          ),

          avatar_url: avatarUrl
        }
      });

  if (profileError) {
    console.error(
      "Could not save profile picture:",
      profileError
    );

    setStatus(
      profileError.message ??
      "Picture uploaded, but could not save it to your profile.",
      true
    );

    return;
  }

  if (avatarPreviewUrl) {
    URL.revokeObjectURL(avatarPreviewUrl);

    avatarPreviewUrl =
      null;
  }

  await renderAccount();

  setStatus(
    "Profile picture saved."
  );
}


function attachUsernameListener() {
  const button =
    document.getElementById(
      "saveUsernameButton"
    );


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    saveUsername
  );
}


async function saveUsername() {
  const input =
    document.getElementById(
      "usernameInput"
    );


  const username =
    input?.value
      .trim() ??
    "";


  // =======================================================
  // VALIDATION
  // =======================================================

  if (
    username.length < 3 ||
    username.length > 20
  ) {
    setStatus(
      "Username must be between 3 and 20 characters.",
      true
    );

    return;
  }


  if (
    !/^[A-Za-z0-9_]+$/.test(
      username
    )
  ) {
    setStatus(
      "Username can only contain letters, numbers and underscores.",
      true
    );

    return;
  }


  // =======================================================
  // GET CURRENT USER
  // =======================================================

  const {
    data: userData,
    error: userError
  } =
    await supabase.auth
      .getUser();


  if (
    userError ||
    !userData.user
  ) {
    console.error(
      "Could not identify user while saving username:",
      userError
    );


    setStatus(
      "Could not identify your account.",
      true
    );

    return;
  }


  const user =
    userData.user;


  setStatus(
    "Saving username..."
  );


  // =======================================================
  // SAVE USERNAME
  // =======================================================

  const {
    error
  } =
    await supabase
      .from(
        "players"
      )
      .upsert(
        {
          id:
            user.id,

          username
        },
        {
          onConflict:
            "id"
        }
      );


  if (error) {
    console.error(
      "Username save failed:",
      error
    );


    // PostgreSQL unique violation.
    // This includes the case-insensitive
    // unique username index.
    if (
      error.code ===
      "23505"
    ) {
      setStatus(
        "That username is already taken.",
        true
      );

      return;
    }


    // Database constraint fallback.
    if (
      error.code ===
      "23514"
    ) {
      setStatus(
        "That username is not valid.",
        true
      );

      return;
    }


    setStatus(
      "Could not save username.",
      true
    );


    return;
  }


  setStatus(
    "Username saved successfully."
  );


  await renderAccount();
}


// =========================================================
// LOGIN SCREEN
// =========================================================

function renderLogin() {
  currentGuestUser =
    null;


  accountCard.innerHTML = `
    <h2>
      Log In
    </h2>

    <p>
      Log in to an existing
      Gem Incremental account.
    </p>

    <label>
      Email

      <input
        id="loginEmail"
        type="email"
        autocomplete="email"
        placeholder="you@example.com"
      >
    </label>

    <label>
      Password

      <input
        id="loginPassword"
        type="password"
        autocomplete="current-password"
        placeholder="Password"
      >
    </label>

    <button
      id="loginButton"
      type="button"
    >
      Log In
    </button>

    <button
      id="createAccountButton"
      type="button"
    >
      Create Account
    </button>

    <button
      id="forgotPasswordButton"
      type="button"
    >
      Forgot Password?
    </button>

    <p class="account-note">
      If your game progress is still
      stored under a guest account,
      create an account from that
      browser first.
    </p>
  `;


  document
    .getElementById(
      "loginButton"
    )
    .addEventListener(
      "click",
      loginExistingAccount
    );


  document
    .getElementById(
      "createAccountButton"
    )
    .addEventListener(
      "click",
      () => {
        setStatus("");

        renderCreateAccount();
      }
    );


  document
    .getElementById(
      "forgotPasswordButton"
    )
    .addEventListener(
      "click",
      () => {
        setStatus("");

        renderPasswordResetRequest();
      }
    );
}


// =========================================================
// CREATE ACCOUNT
// =========================================================

function renderCreateAccount() {
  currentGuestUser =
    null;


  accountCard.innerHTML = `
    <h2>
      Create Account
    </h2>

    <p>
      Create a new account to play across browsers and devices.
    </p>

    <label>
      Email

      <input
        id="createEmail"
        type="email"
        autocomplete="email"
        placeholder="you@example.com"
      >
    </label>

    <label>
      Password

      <input
        id="createPassword"
        type="password"
        autocomplete="new-password"
        placeholder="At least 8 characters"
      >
    </label>

    <label>
      Confirm Password

      <input
        id="createPasswordConfirmation"
        type="password"
        autocomplete="new-password"
        placeholder="Repeat password"
      >
    </label>

    <button
      id="createAccountSubmitButton"
      type="button"
    >
      Create Account
    </button>

    <button
      id="backToLoginButton"
      type="button"
    >
      Back to Log In
    </button>
  `;


  document
    .getElementById(
      "createAccountSubmitButton"
    )
    .addEventListener(
      "click",
      createAccount
    );


  document
    .getElementById(
      "backToLoginButton"
    )
    .addEventListener(
      "click",
      () => {
        setStatus("");

        renderLogin();
      }
    );
}


async function createAccount() {
  const email =
    document
      .getElementById(
        "createEmail"
      )
      ?.value
      .trim() ??
    "";

  const password =
    document
      .getElementById(
        "createPassword"
      )
      ?.value ??
    "";

  const confirmation =
    document
      .getElementById(
        "createPasswordConfirmation"
      )
      ?.value ??
    "";

  if (!email) {
    setStatus(
      "Enter an email address.",
      true
    );

    return;
  }

  if (password.length < 8) {
    setStatus(
      "Password must be at least 8 characters.",
      true
    );

    return;
  }

  if (password !== confirmation) {
    setStatus(
      "Passwords do not match.",
      true
    );

    return;
  }

  setStatus(
    "Creating account..."
  );

  const {
    data,
    error
  } =
    await supabase.auth
      .signUp({
        email,
        password,
        options: {
          data: {
            gem_incremental_password_set:
              true
          },

          emailRedirectTo:
            accountPageUrl()
        }
      });

  if (error) {
    console.error(
      "Account creation failed:",
      error
    );

    setStatus(
      error.message ??
      "Could not create account.",
      true
    );

    return;
  }

  if (!data.session) {
    setStatus(
      "Check your inbox to verify your email, then log in."
    );

    return;
  }

  await renderAccount();

  setStatus(
    "Account created successfully."
  );
}


// =========================================================
// PASSWORD RESET REQUEST
// =========================================================

function renderPasswordResetRequest() {
  currentGuestUser =
    null;


  accountCard.innerHTML = `
    <h2>
      Reset Password
    </h2>

    <p>
      Enter your account email and we will send a reset link.
    </p>

    <label>
      Email

      <input
        id="resetEmail"
        type="email"
        autocomplete="email"
        placeholder="you@example.com"
      >
    </label>

    <button
      id="sendResetButton"
      type="button"
    >
      Send Reset Email
    </button>

    <button
      id="backFromResetButton"
      type="button"
    >
      Back to Log In
    </button>
  `;


  document
    .getElementById(
      "sendResetButton"
    )
    .addEventListener(
      "click",
      requestPasswordReset
    );


  document
    .getElementById(
      "backFromResetButton"
    )
    .addEventListener(
      "click",
      () => {
        setStatus("");

        renderLogin();
      }
    );
}


async function requestPasswordReset() {
  const email =
    document
      .getElementById(
        "resetEmail"
      )
      ?.value
      .trim() ??
    "";

  if (!email) {
    setStatus(
      "Enter an email address.",
      true
    );

    return;
  }

  setStatus(
    "Sending reset email..."
  );

  const {
    error
  } =
    await supabase.auth
      .resetPasswordForEmail(
        email,
        {
          redirectTo:
            `${accountPageUrl()}?reset=1`
        }
      );

  if (error) {
    console.error(
      "Password reset request failed:",
      error
    );

    setStatus(
      "Could not send a reset email. Please try again.",
      true
    );

    return;
  }

  // This wording intentionally does not reveal whether the email
  // belongs to a registered account.
  setStatus(
    "If an account uses that email, a reset link is on its way."
  );
}


// =========================================================
// GUEST LOGIN SCREEN
// =========================================================

function renderGuestLogin(
  user
) {
  currentGuestUser =
    user;


  accountCard.innerHTML = `
    <h2>
      Log In to Existing Account
    </h2>

    <p>
      You are currently using a guest
      account.
    </p>

    <div class="account-info">
      <p>
        <strong>
          Current Guest Player ID:
        </strong>

        <span class="player-id">
          ${escapeHtml(
            user.id
          )}
        </span>
      </p>
    </div>

    <p class="account-note">
      Logging in successfully will switch
      this browser to your registered
      account.
    </p>

    <p class="account-note">
      Any progress stored only on this
      guest account will remain attached
      to the guest Player ID and will not
      automatically merge into your
      registered account.
    </p>

    <hr>

    <label>
      Email

      <input
        id="loginEmail"
        type="email"
        autocomplete="email"
        placeholder="you@example.com"
      >
    </label>

    <label>
      Password

      <input
        id="loginPassword"
        type="password"
        autocomplete="current-password"
        placeholder="Password"
      >
    </label>

    <button
      id="loginButton"
      type="button"
    >
      Log In
    </button>

    <button
      id="cancelLoginButton"
      type="button"
    >
      Back
    </button>
  `;


  document
    .getElementById(
      "loginButton"
    )
    .addEventListener(
      "click",
      loginExistingAccount
    );


  document
    .getElementById(
      "cancelLoginButton"
    )
    .addEventListener(
      "click",
      async () => {
        setStatus(
          ""
        );


        const username =
          await loadUsername(
            user.id
          );


        renderAnonymous(
          user,
          username
        );
      }
    );
}


// =========================================================
// LOGIN
// =========================================================

async function loginExistingAccount() {
  const emailElement =
    document.getElementById(
      "loginEmail"
    );

  const passwordElement =
    document.getElementById(
      "loginPassword"
    );


  const email =
    emailElement
      ?.value
      .trim() ??
    "";

  const password =
    passwordElement
      ?.value ??
    "";


  if (
    !email ||
    !password
  ) {
    setStatus(
      "Enter your email and password.",
      true
    );

    return;
  }


  setStatus(
    "Logging in..."
  );


  const {
    data,
    error
  } =
    await supabase.auth
      .signInWithPassword({
        email,
        password
      });


  if (error) {
    console.error(
      "Login failed:",
      error
    );


    setStatus(
      error.message ??
      "Login failed.",
      true
    );


    return;
  }


  if (!data.user) {
    setStatus(
      "Login succeeded but no user was returned.",
      true
    );

    return;
  }


  if (
    data.user.user_metadata
      ?.gem_incremental_password_set !==
    true
  ) {
    const {
      error: metadataError
    } =
      await supabase.auth
        .updateUser({
          data: {
            ...(
              data.user
                .user_metadata ??
              {}
            ),

            gem_incremental_password_set:
              true
          }
        });


    if (metadataError) {
      console.error(
        "Could not mark password as configured:",
        metadataError
      );
    }
  }


  console.log(
    "Logged in account:",
    {
      id:
        data.user.id,

      email:
        data.user.email
    }
  );


  setStatus(
    "Logged in successfully."
  );


  await renderAccount();
}


// =========================================================
// ANONYMOUS SCREEN
// =========================================================

function renderAnonymous(
  user,
  username
) {
  currentGuestUser =
    user;


  accountCard.innerHTML = `
    <h2>
      Guest Account
    </h2>

    <p>
      Your game is currently connected
      to an anonymous cloud account.
    </p>

    <div class="account-info">
      <p>
        <strong>
          Status:
        </strong>

        Guest
      </p>

      <p>
        <strong>
          Player ID:
        </strong>

        <span class="player-id">
          ${escapeHtml(
            user.id
          )}
        </span>
      </p>
    </div>

    ${usernameSection(
      username
    )}

    <hr>

    <h3>
      Create Account
    </h3>

    <p>
      Link an email to this guest account.
      Your existing game progress will stay
      attached to the same Player ID.
    </p>

    <label>
      Email

      <input
        id="linkEmail"
        type="email"
        autocomplete="email"
        placeholder="you@example.com"
      >
    </label>

    <button
      id="linkEmailButton"
      type="button"
    >
      Send Verification Email
    </button>

    <p class="account-note">
      After verifying your email,
      return to this page to create
      your password.
    </p>

    <hr>

    <h3>
      Already Have an Account?
    </h3>

    <p>
      Log in to a registered account
      instead of converting this guest
      account.
    </p>

    <button
      id="guestLoginButton"
      type="button"
    >
      Log In Instead
    </button>

    <p class="account-note">
      Guest progress is not automatically
      merged when switching accounts.
    </p>
  `;


  attachUsernameListener();


  document
    .getElementById(
      "linkEmailButton"
    )
    .addEventListener(
      "click",
      linkEmail
    );


  document
    .getElementById(
      "guestLoginButton"
    )
    .addEventListener(
      "click",
      () => {
        setStatus(
          ""
        );

        renderGuestLogin(
          user
        );
      }
    );
}


// =========================================================
// LINK EMAIL
// =========================================================

async function linkEmail() {
  const email =
    document
      .getElementById(
        "linkEmail"
      )
      .value
      .trim();


  if (!email) {
    setStatus(
      "Enter an email address.",
      true
    );

    return;
  }


  setStatus(
    "Sending verification email..."
  );


  const {
    error
  } =
    await supabase.auth
      .updateUser(
        {
          email
        },
        {
          emailRedirectTo:
            accountPageUrl()
        }
      );


  if (error) {
    console.error(
      "Email linking failed:",
      error
    );


    setStatus(
      error.message ??
      "Could not link email.",
      true
    );


    return;
  }


  setStatus(
    "Verification email sent. Check your inbox."
  );
}


// =========================================================
// REGISTERED ACCOUNT
// =========================================================

function renderRegistered(
  user,
  username
) {
  currentGuestUser =
    null;


  const passwordSet =
    user.user_metadata
      ?.gem_incremental_password_set ===
    true;

  if (passwordRecoveryMode) {
    renderPasswordResetForm(user);

    return;
  }


  // =======================================================
  // PASSWORD ALREADY SET
  // =======================================================

  if (passwordSet) {
    accountCard.innerHTML = `
      <h2>
        Registered Account
      </h2>

      <div class="account-info">
        <p>
          <strong>
            Status:
          </strong>

          Registered
        </p>

        <p>
          <strong>
            Email:
          </strong>

          ${escapeHtml(
            user.email ??
            "Unknown"
          )}
        </p>

        <p>
          <strong>
            Player ID:
          </strong>

          <span class="player-id">
            ${escapeHtml(
              user.id
            )}
          </span>
        </p>

        <p>
          <strong>
            Password:
          </strong>

          Set
        </p>
      </div>

      ${usernameSection(
        username
      )}

      ${profilePictureSection(
        user
      )}

      <hr>

      <p class="account-note">
        Your account can now be used to
        log in on other browsers and devices.
      </p>

      <button
        id="logoutButton"
        type="button"
      >
        Log Out
      </button>
    `;


    attachUsernameListener();

    attachProfilePictureListener(user);


    document
      .getElementById(
        "logoutButton"
      )
      .addEventListener(
        "click",
        logoutAccount
      );


    return;
  }


  // =======================================================
  // EMAIL VERIFIED, PASSWORD NOT SET
  // =======================================================

  accountCard.innerHTML = `
    <h2>
      Registered Account
    </h2>

    <div class="account-info">
      <p>
        <strong>
          Status:
        </strong>

        Registered
      </p>

      <p>
        <strong>
          Email:
        </strong>

        ${escapeHtml(
          user.email ??
          "Unknown"
        )}
      </p>

      <p>
        <strong>
          Player ID:
        </strong>

        <span class="player-id">
          ${escapeHtml(
            user.id
          )}
        </span>
      </p>
    </div>

    ${usernameSection(
      username
    )}

    ${profilePictureSection(
      user
    )}

    <hr>

    <h3>
      Set Password
    </h3>

    <p>
      Your email has been verified.
      Create a password to finish
      setting up your account.
    </p>

    <label>
      Password

      <input
        id="newPassword"
        type="password"
        autocomplete="new-password"
        placeholder="At least 8 characters"
      >
    </label>

    <label>
      Confirm Password

      <input
        id="confirmPassword"
        type="password"
        autocomplete="new-password"
        placeholder="Repeat password"
      >
    </label>

    <button
      id="setPasswordButton"
      type="button"
    >
      Set Password
    </button>
  `;


  attachUsernameListener();

  attachProfilePictureListener(user);


  document
    .getElementById(
      "setPasswordButton"
    )
    .addEventListener(
      "click",
      setPassword
    );
}


function renderPasswordResetForm(
  user
) {
  currentGuestUser =
    null;


  accountCard.innerHTML = `
    <h2>
      Choose a New Password
    </h2>

    <p>
      Resetting the password for ${escapeHtml(
        user.email ??
        "your account"
      )}.
    </p>

    <label>
      New Password

      <input
        id="newPassword"
        type="password"
        autocomplete="new-password"
        placeholder="At least 8 characters"
      >
    </label>

    <label>
      Confirm New Password

      <input
        id="confirmPassword"
        type="password"
        autocomplete="new-password"
        placeholder="Repeat password"
      >
    </label>

    <button
      id="setPasswordButton"
      type="button"
    >
      Update Password
    </button>
  `;


  document
    .getElementById(
      "setPasswordButton"
    )
    .addEventListener(
      "click",
      setPassword
    );
}


// =========================================================
// SET PASSWORD
// =========================================================

async function setPassword() {
  const isPasswordReset =
    passwordRecoveryMode;

  const password =
    document
      .getElementById(
        "newPassword"
      )
      .value;

  const confirmation =
    document
      .getElementById(
        "confirmPassword"
      )
      .value;


  if (
    password.length < 8
  ) {
    setStatus(
      "Password must be at least 8 characters.",
      true
    );

    return;
  }


  if (
    password !==
    confirmation
  ) {
    setStatus(
      "Passwords do not match.",
      true
    );

    return;
  }


  setStatus(
    isPasswordReset
      ? "Updating password..."
      : "Setting password..."
  );


  const {
    data,
    error
  } =
    await supabase.auth
      .updateUser({
        password
      });


  if (error) {
    console.error(
      "Password update failed:",
      error
    );


    setStatus(
      error.message ??
      "Could not update password.",
      true
    );


    return;
  }


  const existingMetadata =
    data.user
      ?.user_metadata ??
    {};


  const {
    error: metadataError
  } =
    await supabase.auth
      .updateUser({
        data: {
          ...existingMetadata,

          gem_incremental_password_set:
            true
        }
      });


  if (metadataError) {
    console.error(
      "Could not save account setup state:",
      metadataError
    );


    setStatus(
      "Password was updated, but the account page could not update its status. Refresh the page.",
      true
    );


    return;
  }


  if (isPasswordReset) {
    clearPasswordRecoveryMode();
  }


  await renderAccount();

  setStatus(
    isPasswordReset
      ? "Password updated successfully."
      : "Account setup complete."
  );
}


// =========================================================
// LOG OUT
// =========================================================

async function logoutAccount() {
  const confirmed =
    window.confirm(
      "Log out of this account?\n\nYour cloud save will remain safe and can be accessed again by logging back in."
    );


  if (!confirmed) {
    return;
  }


  setStatus(
    "Logging out..."
  );


  const {
    error
  } =
    await supabase.auth
      .signOut();


  if (error) {
    console.error(
      "Logout failed:",
      error
    );


    setStatus(
      error.message ??
      "Could not log out.",
      true
    );


    return;
  }


  setStatus(
    "Logged out successfully."
  );


  renderLogin();
}


// =========================================================
// RENDER ACCOUNT
// =========================================================

async function renderAccount() {
  setStatus(
    ""
  );


  const {
    data: sessionData,
    error: sessionError
  } =
    await supabase.auth
      .getSession();


  if (sessionError) {
    console.error(
      "Account session error:",
      sessionError
    );


    setStatus(
      "Could not load account session.",
      true
    );


    return;
  }


  const session =
    sessionData.session;


  // Do not automatically create an
  // anonymous user on the account page.
  if (!session?.user) {
    renderLogin();

    return;
  }


  const {
    data: userData,
    error: userError
  } =
    await supabase.auth
      .getUser();


  if (userError) {
    console.error(
      "Could not load account user:",
      userError
    );


    setStatus(
      "Could not load account information.",
      true
    );


    return;
  }


  const user =
    userData.user;


  if (!user) {
    renderLogin();

    return;
  }


  const username =
    await loadUsername(
      user.id
    );


  console.log(
    "Account user:",
    {
      id:
        user.id,

      email:
        user.email,

      isAnonymous:
        user.is_anonymous,

      passwordSet:
        user.user_metadata
          ?.gem_incremental_password_set ===
        true,

      username
    }
  );


  if (
    user.is_anonymous
  ) {
    renderAnonymous(
      user,
      username
    );

    return;
  }


  renderRegistered(
    user,
    username
  );
}


// =========================================================
// AUTH CHANGES
// =========================================================

supabase.auth
  .onAuthStateChange(
    (
      event,
      session
    ) => {
      console.log(
        "Account auth event:",
        event,
        session?.user?.id
      );

      if (event === "PASSWORD_RECOVERY") {
        passwordRecoveryMode =
          true;
      }

      if (
        event === "PASSWORD_RECOVERY" ||
        event === "SIGNED_IN"
      ) {
        // Defer until Supabase releases its internal auth lock.
        queueMicrotask(
          () => {
            renderAccount();
          }
        );
      }
    }
  );


// =========================================================
// START
// =========================================================

renderAccount();
