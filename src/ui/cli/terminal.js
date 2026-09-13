// =========================================================
// CLI TERMINAL WIDGET
//
// A small, reusable command-line surface. It renders an output
// log and an input line, keeps a command history, and dispatches
// typed lines to a caller-supplied command set. It knows nothing
// about the game — the maintenance and admin CLIs each build their
// own command list on top of it, so the two remain separate.
// =========================================================


// Split a command line into tokens, honouring "double" and 'single'
// quotes so arguments with spaces (gem names, ban reasons, titles)
// stay intact.
export function tokenize(line) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;

  while ((match = pattern.exec(line)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }

  return tokens;
}


// Make sure the shared stylesheet is present exactly once, resolved
// relative to this module so it works from any page depth.
function ensureStyles() {
  const href = new URL("../../styles/cli.css", import.meta.url).href;

  if (document.querySelector(`link[data-cli-styles]`)) {
    return;
  }

  const link = document.createElement("link");

  link.rel = "stylesheet";
  link.href = href;
  link.dataset.cliStyles = "true";

  document.head.appendChild(link);
}


function padCell(value, width) {
  const text = String(value ?? "");

  return text.length >= width ? text : text + " ".repeat(width - text.length);
}


// commands: array of
//   { name, group, usage, summary, man?, run(args, term) }
// Built-in help / man / clear are added automatically.
export function createCliTerminal(options) {
  const {
    title = "Terminal",
    prompt = ">",
    greeting = [],
    commands = [],
    docked = false,
    onClose = null
  } = options;

  ensureStyles();

  const root = document.createElement("div");

  root.className = docked ? "cli cli--docked" : "cli";

  root.innerHTML = `
    <div class="cli__bar">
      <span class="cli__title">${title}</span>
      <button class="cli__close" type="button" aria-label="Close">×</button>
    </div>
    <div class="cli__output" id="cliOutput" role="log" aria-live="polite"></div>
    <form class="cli__form" id="cliForm">
      <span class="cli__prompt">${prompt}</span>
      <input class="cli__input" id="cliInput" type="text" autocomplete="off"
             autocapitalize="off" spellcheck="false"
             placeholder="type a command — /help or /man">
    </form>
  `;

  const output = root.querySelector("#cliOutput");
  const form = root.querySelector("#cliForm");
  const input = root.querySelector("#cliInput");
  const closeButton = root.querySelector(".cli__close");

  const history = [];
  let historyIndex = -1;
  let pendingConfirm = null;

  // -------------------------------------------------------
  // OUTPUT HELPERS
  // -------------------------------------------------------

  function line(text, variant = "info") {
    const el = document.createElement("p");

    el.className = `cli__line cli__line--${variant}`;
    el.textContent = text;

    output.appendChild(el);
    output.scrollTop = output.scrollHeight;

    return el;
  }

  function lines(list, variant = "info") {
    for (const entry of list) {
      line(entry, variant);
    }
  }

  function table(headers, rows) {
    const widths = headers.map((header, column) =>
      Math.max(
        String(header).length,
        ...rows.map((row) => String(row[column] ?? "").length)
      )
    );

    line(headers.map((header, i) => padCell(header, widths[i])).join("  "), "heading");

    for (const row of rows) {
      line(row.map((cell, i) => padCell(cell, widths[i])).join("  "), "info");
    }
  }

  function keyValues(pairs) {
    const width = Math.max(...pairs.map(([key]) => String(key).length));

    for (const [key, value] of pairs) {
      line(`${padCell(key, width)}  ${value}`, "info");
    }
  }

  // A yes/no prompt. Resolves true only on y / yes. The next typed
  // line answers it instead of running as a command.
  function confirm(message) {
    line(message, "warn");
    line("Type 'y' to confirm, anything else to cancel.", "muted");

    return new Promise((resolve) => {
      pendingConfirm = resolve;
    });
  }

  const term = {
    element: root,
    print: (text) => line(text, "info"),
    printMuted: (text) => line(text, "muted"),
    printError: (text) => line(text, "error"),
    printSuccess: (text) => line(text, "success"),
    printWarn: (text) => line(text, "warn"),
    printHeading: (text) => line(text, "heading"),
    printLines: lines,
    table,
    keyValues,
    confirm,
    clear: () => { output.innerHTML = ""; },
    focus: () => input.focus(),
    run: dispatch
  };

  // -------------------------------------------------------
  // COMMAND REGISTRY (+ built-ins)
  // -------------------------------------------------------

  const registry = new Map();
  const order = [];

  function register(command) {
    registry.set(command.name, command);
    order.push(command.name);
  }

  for (const command of commands) {
    register(command);
  }

  register({
    name: "help",
    group: "General",
    usage: "/help",
    summary: "List every command grouped by area.",
    run() {
      const groups = new Map();

      for (const name of order) {
        const command = registry.get(name);
        const group = command.group ?? "Commands";

        if (!groups.has(group)) {
          groups.set(group, []);
        }

        groups.get(group).push(command);
      }

      for (const [group, groupCommands] of groups) {
        term.printHeading(group);

        for (const command of groupCommands) {
          term.print(`  ${command.usage}`);
          term.printMuted(`      ${command.summary}`);
        }
      }

      term.printMuted("Use /man <command> for details on one command.");
    }
  });

  register({
    name: "man",
    group: "General",
    usage: "/man [command]",
    summary: "Show the full manual, or one command's manual page.",
    run(args) {
      const names = args.length ? args : order;

      if (args.length && !registry.has(args[0].replace(/^\//, ""))) {
        term.printError(`No manual entry for '${args[0]}'.`);

        return;
      }

      if (!args.length) {
        term.printHeading("MANUAL");
        term.printMuted("Arguments in <angles> are required, [brackets] optional.");
        term.printMuted("Wrap values with spaces in \"double quotes\".");
      }

      for (const rawName of names) {
        const command = registry.get(rawName.replace(/^\//, ""));

        if (!command) {
          continue;
        }

        term.printHeading(command.name);
        term.print(`  Usage:   ${command.usage}`);
        term.print(`  ${command.summary}`);

        if (command.man) {
          for (const detail of command.man) {
            term.printMuted(`  ${detail}`);
          }
        }
      }
    }
  });

  register({
    name: "clear",
    group: "General",
    usage: "/clear",
    summary: "Clear the screen.",
    run() {
      term.clear();
    }
  });

  // -------------------------------------------------------
  // DISPATCH
  // -------------------------------------------------------

  async function dispatch(rawLine) {
    const trimmed = rawLine.trim();

    if (trimmed === "") {
      return;
    }

    line(`${prompt} ${trimmed}`, "echo");

    // If a confirmation is pending, this line answers it.
    if (pendingConfirm) {
      const resolve = pendingConfirm;

      pendingConfirm = null;

      resolve(/^(y|yes)$/i.test(trimmed));

      return;
    }

    const tokens = tokenize(trimmed);
    const name = tokens[0].replace(/^\//, "").toLowerCase();
    const command = registry.get(name);

    if (!command) {
      term.printError(`Unknown command: ${tokens[0]}. Try /help.`);

      return;
    }

    try {
      await command.run(tokens.slice(1), term);
    } catch (error) {
      term.printError(`Error: ${error?.message ?? String(error)}`);
    }
  }

  // -------------------------------------------------------
  // INPUT WIRING
  // -------------------------------------------------------

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const value = input.value;

    input.value = "";

    if (value.trim() !== "") {
      history.push(value);

      if (history.length > 200) {
        history.shift();
      }
    }

    historyIndex = history.length;

    dispatch(value);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();

      if (history.length === 0) {
        return;
      }

      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] ?? "";
    } else if (event.key === "ArrowDown") {
      event.preventDefault();

      if (history.length === 0) {
        return;
      }

      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] ?? "";
    }
  });

  closeButton.addEventListener("click", () => {
    if (typeof onClose === "function") {
      onClose();
    }
  });

  // Greeting.
  if (Array.isArray(greeting)) {
    lines(greeting, "muted");
  } else if (greeting) {
    line(greeting, "muted");
  }

  return term;
}
