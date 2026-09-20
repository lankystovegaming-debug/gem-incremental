import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [shell, css] = await Promise.all([
  readFile(new URL("../src/ui/shell.js", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/app.css", import.meta.url), "utf8")
]);

assert.match(shell, /data-more-action="quicknav"/);
assert.match(shell, /function mountQuickNavigation\(/);
assert.match(shell, /function navigationDestinations\(/);
assert.match(shell, /event\.key\.toLowerCase\(\) === "k"/);
assert.match(shell, /event\.key === "ArrowDown"/);
assert.match(shell, /event\.key === "Enter"/);
assert.match(shell, /aria-modal="true"/);
assert.match(css, /\.quick-nav \{/);
assert.match(css, /\.quick-nav__item\.is-active/);

console.log("shell quick-navigation checks passed");
