// Safe local QA: renders the real consoles with fixtures, never imports a live backend.
import http from "node:http";
import fs from "node:fs/promises";
import { consoleHarness, mineDashboard, hellDashboard, volcanicDashboard, volcanicRun } from "./expedition-console-harness.mjs";
import { completionSummary } from "../src/ui/expeditionConsole.js";
const port = Number(process.env.PORT || 5587);
const mine = await consoleHarness("mine"), volcanic = await consoleHarness("volcanic");
const receipt = completionSummary("Volcanic Depths", { run: { ...volcanicRun, status: "settled", extraction_reason: "overwhelming_eruption", overdepth: 8, settlement: { cargoValue: 850000 } } });
http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (/^\/(src|expeditions|abandoned-mine|volcanic-depths)\/[\w/.-]+\.(css|js|woff2?)$/.test(url.pathname) && !url.pathname.includes("..")) {
    try { const body = await fs.readFile(new URL(`..${url.pathname}`, import.meta.url)); response.writeHead(200, { "Content-Type": url.pathname.endsWith("css") ? "text/css" : "text/javascript" }); response.end(body); } catch { response.writeHead(404).end(); } return;
  }
  const kind = url.searchParams.get("kind") || "volcanic", width = url.searchParams.get("width");
  const content = kind === "volcanic" ? `<div class="volcanic-grid"><article class="card">${volcanic.render(volcanicDashboard)}</article></div>` : mine.render(mineDashboard, kind === "hell" ? hellDashboard : { ...hellDashboard, run: null });
  response.writeHead(200, { "Content-Type": "text/html" });
  response.end(`<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Expedition console QA</title><link rel="stylesheet" href="/src/styles/app.css"><link rel="stylesheet" href="/expeditions/expeditions.css"><link rel="stylesheet" href="/abandoned-mine/mine-console.css"><link rel="stylesheet" href="/volcanic-depths/volcanic-depths.css"><style>body{margin:0;padding:0}main{box-sizing:border-box;max-width:${width === "390" ? "390px" : "1200px"};margin:0 auto;padding:16px}.volcanic-grid{grid-template-columns:1fr}.qa-nav{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}</style></head><body><main><nav class="qa-nav"><a href="?kind=mine">Mine</a><a href="?kind=hell">Hell</a><a href="?kind=volcanic">Volcanic</a><button id="receipt" class="btn">Test completion receipt</button></nav>${content}</main><script type="module">import {showExpeditionComplete} from '/src/ui/expeditionConsole.js';document.getElementById('receipt').addEventListener('click',()=>showExpeditionComplete(${JSON.stringify(receipt)}));</script></body></html>`);
}).listen(port, "127.0.0.1", () => console.log(`Expedition fixture preview: http://127.0.0.1:${port}`));
