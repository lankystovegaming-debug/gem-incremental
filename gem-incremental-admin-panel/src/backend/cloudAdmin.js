import { invokeFunction } from "./invoke.js";


export function adminRequest(action, body = {}) {
  return invokeFunction("admin", { action, ...body });
}
