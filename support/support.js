import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";

mountShell({ page: "support", base: "../" });

document.getElementById("supportHeart").innerHTML = icons.heart;
document.getElementById("supportButtonIcon").innerHTML = icons.heart;
document.getElementById("serverIcon").innerHTML = icons.cloud;
document.getElementById("updateIcon").innerHTML = icons.sparkle;
document.getElementById("fairIcon").innerHTML = icons.shield;
document.getElementById("thanksIcon").innerHTML = icons.heart;
