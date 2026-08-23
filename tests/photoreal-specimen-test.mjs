import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const style = readFileSync(new URL("../src/ui/gemStyle.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
assert.ok(!existsSync(new URL("../src/styles/photoreal-material-library.css", import.meta.url)));
assert.ok(style.includes("specimenForGem"));
assert.ok(style.includes('uranium-specimen'));
assert.ok(app.includes('data-gem-specimen="uranium-specimen"'));
for (const name of ["quartz","calcite","feldspar","jasper","uranium-specimen","amethyst","opal","hematite","labradorite","tourmaline","sapphire","ruby","aquamarine","emerald","pyrite","obsidian","moonstone","citrine","diamond","turquoise"]) {
  assert.ok(existsSync(new URL(`../src/assets/photoreal/specimens2/${name}.webp`, import.meta.url)), name);
}
console.log("Photoreal specimen assets test passed (large unused CSS archive intentionally omitted).");
