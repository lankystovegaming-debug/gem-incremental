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
// =========================================================

function renderLogin() {
  accountCard.innerHTML = `
    <h2>
      Log In
    </h2>

    <p>
      Log in to an existing Gem Incremental account.
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

    <hr>

    <p>
      Don't have an account yet?
    </p>

    <a href="/">
      Return to the game
    </a>

    <p class="account-note">
      If you already have guest progress,
      open the game in the browser where
      that progress is stored, then create
      an account from there.
    </p>
  `;


  const loginButton =
    document.getElementById(
      "loginButton"
    );


  loginButton.addEventListener(
    "click",
    loginExistingAccount
  );
}


// =========================================================
// LOGIN
// =========================================================

async function loginExistingAccount() {
  const email =
    document
      .getElementById(
        "loginEmail"
      )
      .value
      .trim();

  const password =
    document
      .getElementById(
        "loginPassword"
      )
      .value;


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
  `;


  document
    .getElementById(
      "linkEmailButton"
    )
    .addEventListener(
      "click",
      linkEmail
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
// REGISTERED / VERIFIED ACCOUNT
// =========================================================

function renderRegistered(
  user
) {
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


  setStatus(
    "Account setup complete."
  );


  console.log(
    "Permanent account user:",
    data.user
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


  // No session:
  // IMPORTANT — do not automatically create
  // an anonymous user here. This page must
  // allow existing users to log in.
  if (!session?.user) {
    renderLogin();

    return;
  }


  // Fetch fresh user data from Auth.
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
