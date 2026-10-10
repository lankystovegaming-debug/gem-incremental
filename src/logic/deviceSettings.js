// Settings that control a browser-local runtime must survive account-settings
// hydration and unrelated cloud saves. They are deliberately not persisted in
// player_settings because another device may be running its own roll session.
export function mergeDeviceSettings(remoteSettings = {}, localSettings = {}, localPatch = {}) {
  const requestedPool = localPatch.rollPool ?? localSettings.rollPool;

  return {
    ...(remoteSettings && typeof remoteSettings === "object" ? remoteSettings : {}),
    rollPool: requestedPool === "deep_sea" ? "deep_sea" : "normal"
  };
}
