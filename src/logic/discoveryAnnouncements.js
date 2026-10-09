const CUSTOM_DISCOVERY_ANNOUNCEMENTS = Object.freeze({
  "Heart of the Deep": "The abyss has answered {player}.",
  "Glitched Gem": "{player} was not supposed to find this.",
  Finality: "It ends with {player}.",
  "Heat Death": "Around {player}, the last light has gone out.",
  Reminiscite: "{player} remembered what the universe forgot.",
  Incandescity: "The stars collided, and {player} caught the flame.",
  Zephyrion: "The universe briefly lost track of {player}.",
  Hadopelagic: "{player} descended where light cannot follow.",
  "The Bottom": "{player} reached the bottom. Something was already there.",
  i: "{player} has discovered something that should not exist."
});

export function customDiscoveryAnnouncement(gemName, username) {
  const template = CUSTOM_DISCOVERY_ANNOUNCEMENTS[String(gemName ?? "")];
  if (!template) return null;
  return template.replace("{player}", String(username || "Someone"));
}

export { CUSTOM_DISCOVERY_ANNOUNCEMENTS };
