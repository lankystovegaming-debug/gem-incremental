// =========================================================
// CLI TERMINAL WIDGET
//
// A small, reusable command-line surface. It renders an output
// log and an input line, keeps a command history, offers
// Minecraft-style autocomplete suggestions, and dispatches typed
// lines to a caller-supplied command set. It knows nothing about
// the game — the maintenance and admin CLIs each build their own
// command list on top of it, so the two remain separate.
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
//   { name, group, usage, summary, man?, suggest?(args), run(args, term) }
// `suggest(args)` returns candidate strings for the next argument.
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
      <div class="cli__suggestions" id="cliSuggestions" hidden></div>
      <div class="cli__hint" id="cliHint" hidden></div>
      <div class="cli__inputrow">
        <span class="cli__prompt">${prompt}</span>
        <input class="cli__input" id="cliInput" type="text" autocomplete="off"
               autocapitalize="off" spellcheck="false"
               placeholder="type a command — /help or /man">
      </div>
    </form>
  `;

  const output = root.querySelector("#cliOutput");
  const form = root.querySelector("#cliForm");
  const input = root.querySelector("#cliInput");
  const closeButton = root.querySelector(".cli__close");
  const suggestionsBox = root.querySelector("#cliSuggestions");
  const hintBar = root.querySelector("#cliHint");

  const history = [];
  let historyIndex = -1;
  let pendingConfirm = null;
  let suggestions = [];
  let selected = 0;

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

      term.printMuted("Tab completes commands. Use /man <command> for details.");
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
        term.printMuted("Wrap values with spaces in \"double quotes\". Tab autocompletes.");
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
  // AUTOCOMPLETE
  // -------------------------------------------------------

  // Work out completion candidates for the current input. Each result
  // is { label, hint, apply } where `apply` is the full input line to
  // set if the candidate is chosen.
  function computeSuggestions(value) {
    const endsWithSpace = /\s$/.test(value);
    const tokens = tokenize(value);

    // Completing the command name (first token).
    if (tokens.length === 0 || (tokens.length === 1 && !endsWithSpace)) {
      const prefix = (tokens[0] ?? "").replace(/^\//, "").toLowerCase();

      return order
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({
          label: `/${name}`,
          hint: registry.get(name).summary,
          apply: `/${name} `
        }));
    }

    // Completing an argument via the command's own suggest() hook.
    const command = registry.get(tokens[0].replace(/^\//, "").toLowerCase());

    if (!command || typeof command.suggest !== "function") {
      return [];
    }

    const priorArgs = endsWithSpace ? tokens.slice(1) : tokens.slice(1, -1);
    const partial = endsWithSpace ? "" : tokens[tokens.length - 1];

    let candidates = [];

    try {
      candidates = command.suggest(priorArgs) ?? [];
    } catch {
      candidates = [];
    }

    const base = (endsWithSpace ? tokens : tokens.slice(0, -1)).join(" ");

    return candidates
      .filter((candidate) => candidate.toLowerCase().startsWith(partial.toLowerCase()))
      .map((candidate) => ({
        label: candidate,
        hint: "",
        apply: `${base} ${candidate} `
      }));
  }

  function renderSuggestions() {
    suggestions = pendingConfirm ? [] : computeSuggestions(input.value);

    if (!suggestions.length) {
      suggestionsBox.hidden = true;
      suggestionsBox.innerHTML = "";

      return;
    }

    if (selected >= suggestions.length) {
      selected = 0;
    }

    suggestionsBox.innerHTML = suggestions
      .map((suggestion, index) => `
        <div class="cli__suggestion${index === selected ? " is-active" : ""}" data-index="${index}">
          <span class="cli__suggestion-name">${escapeText(suggestion.label)}</span>
          <span class="cli__suggestion-hint">${escapeText(suggestion.hint)}</span>
        </div>
      `)
      .join("");

    suggestionsBox.hidden = false;
  }

  function escapeText(text) {
    return String(text ?? "").replace(/[&<>"]/g, (character) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]
    ));
  }

  // Once a command is recognised, show its parameter signature and
  // highlight the argument currently being typed — the Minecraft-style
  // hint you get after typing e.g. "/ban ".
  function updateHint(value) {
    const endsWithSpace = /\s$/.test(value);
    const tokens = tokenize(value);

    if (pendingConfirm || tokens.length === 0) {
      hintBar.hidden = true;

      return;
    }

    const command = registry.get(tokens[0].replace(/^\//, "").toLowerCase());

    // Only once the command is chosen (followed by a space or an argument).
    if (!command || (tokens.length === 1 && !endsWithSpace)) {
      hintBar.hidden = true;

      return;
    }

    const argIndex = endsWithSpace ? tokens.length - 1 : tokens.length - 2;
    const params = command.usage.split(/\s+/).slice(1);

    const rendered = params
      .map((part, index) => (
        index === argIndex
          ? `<b class="cli__hint-current">${escapeText(part)}</b>`
          : `<span>${escapeText(part)}</span>`
      ))
      .join(" ");

    hintBar.innerHTML =
      `<span class="cli__hint-name">/${escapeText(command.name)}</span> ${rendered}` +
      (command.summary ? ` <span class="cli__hint-sub">— ${escapeText(command.summary)}</span>` : "");

    hintBar.hidden = false;
  }

  function applySuggestion(index) {
    const suggestion = suggestions[index];

    if (!suggestion) {
      return;
    }

    input.value = suggestion.apply;

    selected = 0;

    renderSuggestions();
    updateHint(input.value);

    input.focus();
  }

  function hideSuggestions() {
    suggestions = [];
    suggestionsBox.hidden = true;
    suggestionsBox.innerHTML = "";
  }

  function hideHint() {
    hintBar.hidden = true;
    hintBar.innerHTML = "";
  }

  // Apply on mousedown so the input does not blur away before the click.
  suggestionsBox.addEventListener("mousedown", (event) => {
    const item = event.target.closest(".cli__suggestion");

    if (!item) {
      return;
    }

    event.preventDefault();

    applySuggestion(Number(item.dataset.index));
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

    hideSuggestions();
    hideHint();

    if (value.trim() !== "") {
      history.push(value);

      if (history.length > 200) {
        history.shift();
      }
    }

    historyIndex = history.length;

    dispatch(value);
  });

  input.addEventListener("input", () => {
    selected = 0;

    renderSuggestions();
    updateHint(input.value);
  });

  input.addEventListener("keydown", (event) => {
    const open = !suggestionsBox.hidden && suggestions.length > 0;

    if (event.key === "Tab") {
      // Tab completes the highlighted suggestion (Minecraft-style).
      if (open) {
        event.preventDefault();

        applySuggestion(selected);
      }

      return;
    }

    if (event.key === "Escape") {
      // Escape first dismisses the suggestion list; a second press can
      // then bubble up to close the terminal.
      if (open) {
        event.preventDefault();
        event.stopPropagation();

        hideSuggestions();
      }

      return;
    }

    if (event.key === "ArrowDown") {
      if (open) {
        event.preventDefault();

        selected = (selected + 1) % suggestions.length;

        renderSuggestions();
      } else if (history.length) {
        event.preventDefault();

        historyIndex = Math.min(history.length, historyIndex + 1);
        input.value = history[historyIndex] ?? "";
      }

      return;
    }

    if (event.key === "ArrowUp") {
      if (open) {
        event.preventDefault();

        selected = (selected - 1 + suggestions.length) % suggestions.length;

        renderSuggestions();
      } else if (history.length) {
        event.preventDefault();

        historyIndex = Math.max(0, historyIndex - 1);
        input.value = history[historyIndex] ?? "";
      }

      return;
    }
  });

  input.addEventListener("blur", () => {
    // Let a click on a suggestion land first.
    setTimeout(() => {
      hideSuggestions();
      hideHint();
    }, 120);
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
