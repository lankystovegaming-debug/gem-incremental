import { invokeFunction } from "./invoke.js";

export async function loadMuseum() {
  return invokeFunction("museum", { action: "state" });
}

export async function placeMuseumExhibit(specimenId, slot) {
  return invokeFunction("museum", { action: "place", specimenId, slot }, { retries: 0 });
}

export async function removeMuseumExhibit(slot) {
  return invokeFunction("museum", { action: "remove", slot }, { retries: 0 });
}

export async function expandMuseum() {
  return invokeFunction("museum", { action: "expand" }, { retries: 0 });
}

export async function registerMuseumSpecimen(specimenId) {
  return invokeFunction("museum", { action: "register", specimenId }, { retries: 0 });
}
