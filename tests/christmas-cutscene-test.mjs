import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BESPOKE_CUTSCENES,configuredCutsceneDuration} from '../src/ui/cutsceneConfig.js';
import {createCutsceneEnvelope,resultFromEnvelope} from '../src/ui/cutsceneEnvelope.js';
import {createCutsceneQueueItem,compareCutsceneItems,cutsceneQueueKey} from '../src/ui/cutsceneQueueModel.js';
import {scenePrimitivesMarkup} from '../src/ui/cutscenePrimitives.js';

test('all nine Christmas sequences have bounded durations and special source odds stay hidden',()=>{
  const durations={'north star':12000,"winter's heart":14000,'aurora borealis':15000,'guiding star':12500,yuletide:15000,'eternal christmas':20000,'celestine veil':16000,'wish upon a star':16500,'christmas singularity':21000};
  for(const [name,duration] of Object.entries(durations)){
    const def=BESPOKE_CUTSCENES[name];assert.equal(def.duration,duration);assert.deepEqual(def.primitives,['christmas-world']);
    assert(configuredCutsceneDuration({gemName:name,rarity:0,reducedMotion:true})<duration);
  }
  for(const name of ['celestine veil','wish upon a star','christmas singularity']){const def=BESPOKE_CUTSCENES[name];assert(def.hideChance);assert(def.anomalous);assert(!JSON.stringify(def).match(/75,?000|1\/25|2%/));}
  assert(!BESPOKE_CUTSCENES['wrapped miracle']);
  assert.match(scenePrimitivesMarkup(['christmas-world']),/cs-christmas-aurora/);
});
test('envelopes freeze specimen snapshots, preserve source identity and order ordinary before Aurora',()=>{
  const snapshot={gem:{name:'North Star',rarity:300000000,baseWeight:125},mutations:[{id:'polished',name:'Polished at discovery',multiplier:1.5}],actualChanceLabel:'Stored discovery chance'};
  const make=(source,sequence)=>createCutsceneEnvelope({receiptId:`receipt-${sequence}`,source,operationId:'batch-subroll-1',sequence,snapshot});
  const ordinary=make('ordinary-roll',0),aurora=make('christmas-aurora',1);
  snapshot.gem.baseWeight=999;assert.equal(ordinary.snapshot.gem.baseWeight,125);assert(Object.isFrozen(ordinary.snapshot.gem));
  assert.throws(()=>ordinary.snapshot.gem.baseWeight=2,TypeError);
  const a=createCutsceneQueueItem(resultFromEnvelope(ordinary)),b=createCutsceneQueueItem(resultFromEnvelope(aurora));
  assert.notEqual(cutsceneQueueKey(a.result),cutsceneQueueKey(b.result));assert(compareCutsceneItems(a,b)<0);
  assert.equal(resultFromEnvelope(ordinary).mutations[0].name,'Polished at discovery');
  assert.throws(()=>createCutsceneEnvelope({...ordinary,source:'client-forged-source'}),/invalid_cutscene_envelope/);
});
