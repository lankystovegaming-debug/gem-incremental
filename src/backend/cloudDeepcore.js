import { invokeFunction } from "./invoke.js";
import { loadCloudGems } from "./cloudInventory.js";

export async function deepcoreRequest(action = "snapshot", payload = {}) {
  const { data, error } = await invokeFunction("deepcore", { action, ...payload }, { retries: action === "snapshot" ? 2 : 0 });
  if (error) throw new Error(error.message || "Deepcore is temporarily unavailable.");
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

export async function loadDeepcoreSpecimens() {
  const gems = await loadCloudGems();
  return (gems || []).filter((gem) => !gem.locked).sort((a, b) => Number(b.value) - Number(a.value));
}

export const requestId = () => crypto.randomUUID();
