import { invokeFunction } from "./invoke.js";

export async function deepSeaRequest(action = "snapshot", payload = {}) {
  const { data, error } = await invokeFunction("deep-sea", { action, ...payload }, { retries: action === "snapshot" ? 2 : 0 });
  if (error) throw new Error(error.message || error.code || "Deep Sea is temporarily unavailable.");
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}
