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


let currentGuestUser =
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
// LOGIN SCREEN
//
// Used when there is NO current session.
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
}


// =========================================================
// GUEST LOGIN SCREEN
//
// IMPORTANT:
// We do NOT sign the guest out before login.
//
// If login fails, their current guest
// account remains active.
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
          ${escapeHtml(user.id)}
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
      () => {
        setStatus(
          ""
        );

        renderAnonymous(
          user
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


  if (
    !data.user
  ) {
    setStatus(
      "Login succeeded but no user was returned.",
      true
    );

    return;
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
  user
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
          ${escapeHtml(user.id)}
        </span>
      </p>
    </div>

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
            `${window.location.origin}/account/`
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
  user
) {
  currentGuestUser =
    null;


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
          ${escapeHtml(user.id)}
        </span>
      </p>
    </div>

    <hr>

    <h3>
      Set Password
    </h3>

    <p>
      If you have just verified your email,
      create a password below.
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
    "Setting password..."
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
      "Password creation failed:",
      error
    );


    setStatus(
      error.message ??
      "Could not set password.",
      true
    );


    return;
  }


  console.log(
    "Permanent account user:",
    data.user
  );


  setStatus(
    "Account setup complete."
  );


  await renderAccount();
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


  // IMPORTANT:
  // Do not automatically create an
  // anonymous user on this page.
  if (!session?.user) {
    renderLogin();

    return;
  }


  // Fetch fresh Auth information.
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


  console.log(
    "Account user:",
    {
      id:
        user.id,

      email:
        user.email,

      isAnonymous:
        user.is_anonymous
    }
  );


  if (
    user.is_anonymous
  ) {
    renderAnonymous(
      user
    );

    return;
  }


  renderRegistered(
    user
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
    }
  );


// =========================================================
// START
// =========================================================

renderAccount();
