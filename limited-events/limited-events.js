import { mountShell } from "../src/ui/shell.js";
mountShell({ page: "limited-events", base: "../" });
const now = Date.now(), start = Date.parse("2026-09-20T00:00:00Z"), end = Date.parse("2026-10-04T00:00:00Z");
document.querySelector("#deepcoreStatus").textContent = now < start ? "PREVIEW" : now < end ? "ACTIVE" : "ARCHIVED";
