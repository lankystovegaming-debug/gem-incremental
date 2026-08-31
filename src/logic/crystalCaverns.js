export const CRYSTAL_INTENSITIES=Object.freeze({
  careful:{label:"Careful",progressMultiplier:1,instabilityPer50:0},
  forceful:{label:"Forceful",progressMultiplier:1.25,instabilityPer50:2},
  fracturing:{label:"Fracturing",progressMultiplier:1.6,instabilityPer50:5}
});

export function crystalArtifactMultiplier(instability){
  return 3-2*Math.exp(-Math.max(0,Number(instability)||0)/125);
}

export function crystalSeverityProbabilities(instability){
  const value=Math.max(0,Number(instability)||0);
  const minor=.65*Math.exp(-Math.pow(value/145,1.406));
  const critical=.08+.92*(1-Math.exp(-Math.pow(value/320,1.767)));
  return{minor,major:Math.max(0,1-minor-critical),critical};
}

export function crystalBaseProgress({rarity=0,mutationIds=[],finalWeight=0,baseWeight=0,weightMultiplier}={}){
  let progress=1;
  const chance=Number(rarity)||0;
  if(chance>=50)progress+=1;
  if(chance>=1000)progress+=3;
  if(chance>=10000)progress+=7;
  if(Array.isArray(mutationIds)&&mutationIds.length)progress+=3;
  const displayedMultiplier=Number.isFinite(Number(weightMultiplier))?Number(weightMultiplier):(Number(baseWeight)>0?Number(finalWeight)/Number(baseWeight):0);
  if(displayedMultiplier>=2)progress+=3;
  return progress;
}

export function crystalRollGains(payload,intensity="careful"){
  const baseProgress=crystalBaseProgress(payload);
  const mode=CRYSTAL_INTENSITIES[intensity]||CRYSTAL_INTENSITIES.careful;
  return{baseProgress,progress:baseProgress*mode.progressMultiplier,instability:baseProgress*mode.instabilityPer50/50};
}
