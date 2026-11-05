import {executeWorld2Batch} from './world2Pipeline.js';
import {beginLawRoll,finishLawRoll,applyLawStats,lawFinalWeight,lawSpeedFactor,
 inverseGemMass,sampleMass,distortSingleton,finalWinningMass} from './world2Laws.js';

// Trusted server composition with the existing optimized ordinary evaluator.
// Deliberately not an HTTP API: no callbacks, stats, catalogues or outcomes can
// come from browser JSON. Existing disabled dispatch remains in index.ts.
// Each stage must be applied at its semantic boundary, not to a finished result.
export function createWorld2LawEvaluator(evaluateOrdinary) {
 if(typeof evaluateOrdinary!=='function')throw new Error('world2_missing_backend_evaluator');
 return async ({context,epoch,random}) => {
  if(epoch.starts_at!==context.epochStart)throw new Error('world2_epoch_mismatch');
  const roll=beginLawRoll({epoch,state:context.lawState,envyRemaining:context.envyRemaining,random});
  const used=new Set();let measurement,selectedGem,naturalIds;
  const once=name=>{if(used.has(name))throw new Error('world2_duplicate_stage_'+name);used.add(name);};
  const stages={
   // Call after ordinary overrides, before per-gem cap/probability resolution.
   stats(ordinary) {
    for(const key of ['luck','mutation','speed','weightLuck'])if(Object.hasOwn(ordinary,key))once('stat_'+key);
    return applyLawStats(ordinary,roll);
   },
   // Supply exact eligible ordered hazards and actual fallback from optimized
   // backend AFTER selection restrictions, gem Luck factors and maxLuck caps.
   gem(orderedHazards,fallbackId) {
    once('gem');if(!used.has('stat_luck'))throw new Error('world2_backend_stage_order');selectedGem=sampleMass(inverseGemMass(finalWinningMass(orderedHazards,fallbackId),context.history,epoch.b_id),random);return selectedGem;
   },
   // Call after independent natural trials, before exclusive/size additions,
   // feedback effects and the existing combined mutation-value cap.
   mutations(natural,effectiveCatalog) {
    once('mutations');if(!used.has('stat_mutation'))throw new Error('world2_backend_stage_order');const resolved=epoch.b_id==='distortion'?distortSingleton(natural,effectiveCatalog,context.history,random):natural;naturalIds=resolved.map(m=>m.id);return resolved;
   },
   // Call before value/filter/equipment finish logic; F0 must be ordinary final
   // weight including size/masterwork/storage, with raw R separately supplied.
   weight(ordinary) {once('weight');if(!used.has('stat_weightLuck'))throw new Error('world2_backend_stage_order');measurement={...ordinary,...lawFinalWeight(ordinary,roll,random)};return measurement;}
  };
  const result=await evaluateOrdinary({context,epoch,random,stages});
  // Preserve optimized early House Edge/empty branches: they consume a genuine
  // position without constructing a gem, weight or mutation candidate.
  const specimen=result.primary;
  if(result.kind==='ordinary') {
   if(!used.has('stat_luck')||!used.has('gem')||!used.has('stat_mutation')||!used.has('stat_weightLuck')||!used.has('mutations')||!used.has('weight')||!specimen||!Array.isArray(specimen.natural_mutation_ids))throw new Error('world2_missing_backend_stages');
   if(specimen.gem_name!==selectedGem.id||specimen.rarity!==selectedGem.rarity||JSON.stringify(specimen.natural_mutation_ids)!==JSON.stringify(naturalIds))throw new Error('world2_identity_not_applied');
   if(specimen.final_weight!==measurement.finalWeight)throw new Error('world2_weight_not_applied');
  }
  const observed={kind:result.kind,rarity:Number(specimen?.rarity??0),
   rawWeight:measurement?.rawWeight??0,naturalMutationCount:specimen?.natural_mutation_ids?.length??0};
  const next=finishLawRoll(roll,observed,random);
  return {...result,...next,primary:result.kind==='ordinary'?{...specimen,
   ordinary_final_weight_ratio:measurement.ordinaryFinalWeightRatio,
   rolled_weight_multiplier:measurement.rawWeight}:specimen};
 };
}
export function executeWorld2LawBatch({priceOrdinaryContext,evaluateOrdinary,...options}) {
 // The ordinary pricer uses deployed 2.5s / final ordinary speed, including
 // overrides/admin events/Slow Starter. Law speed is constant within an epoch.
 return executeWorld2Batch({...options,
  priceContext:async context=>(await priceOrdinaryContext(context))/lawSpeedFactor(context.epoch),
  evaluate:createWorld2LawEvaluator(evaluateOrdinary)});
}
