import { invokeFunction } from './invoke.js';
export const loadBundles = () => invokeFunction('bundles',{action:'state'});
export const loadBundleCandidates = (requirementId,offset=0) => invokeFunction('bundles',{action:'candidates',requirementId,offset});
export const setBundleAuto = (requirementId,enabled) => invokeFunction('bundles',{action:'set_auto',requirementId,enabled},{retries:0});
export const contributeBundle = (requirementId,specimenIds,confirmCrown=false) => invokeFunction('bundles',{action:'contribute',requirementId,specimenIds,confirmCrown},{retries:0});
export const loadBundleSummary = playerId => invokeFunction('bundles',{action:'summary',playerId});
