import { getGemMutation } from "../data/mutations.js";
import { getSettings } from "./settings.js";
import { renderCutscene } from "./cutsceneScenes.js";
import {
  cutsceneController,
  cutsceneDuration,
  isCutsceneEligible
} from "./cutsceneController.js";

// Replay deliberately enters through the same eligibility, duration, registry,
// renderer and lifecycle controller as a live roll. Replay performs no outcome
// or inventory action of its own.
export function replayGemCutscene({ gem, mutationId = null, mutationIds = [] }) {
  const rarity = Number(gem?.rarity ?? 0);
  const threshold = getSettings().cutsceneMinimumRarity;

  if (!isCutsceneEligible({ rarity, gemName: gem?.name, threshold, dropType: gem?.dropType })) {
    return Promise.resolve({ played: false });
  }
  if (cutsceneController.isActive) return Promise.resolve({ played: false, busy: true });

  const ids = Array.from(new Set([
    ...(Array.isArray(mutationIds) ? mutationIds : []),
    ...(mutationId ? [mutationId] : [])
  ])).filter(Boolean);
  const replayData = {
    gem: { ...gem, rarity },
    mutationIds: ids,
    mutations: ids.map((id) => getGemMutation(id)).filter(Boolean)
  };
  const duration = cutsceneDuration({ rarity, gemName: gem?.name });

  return cutsceneController.play({
    duration,
    render: () => renderCutscene(replayData, duration, { replay: true })
  });
}
