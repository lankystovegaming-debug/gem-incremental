const sources=new Set(['ordinary-roll','christmas-aurora','christmas-present','bottled-christmas','christmas-story']);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

// A source receipt identifies one committed outcome independently of the gem
// name, displayed batch, current catalogue and visual acknowledgement.
export function createCutsceneEnvelope({receiptId,source,operationId,sequence=0,snapshot}) {
  if(!sources.has(source)||typeof receiptId!=='string'||!receiptId||typeof operationId!=='string'||!operationId||!Number.isSafeInteger(sequence)||sequence<0||!snapshot||typeof snapshot!=='object')throw new Error('invalid_cutscene_envelope');
  return freeze(JSON.parse(JSON.stringify({version:1,receiptId,source,operationId,sequence,snapshot})));
}
export function resultFromEnvelope(envelope) {
  const checked=createCutsceneEnvelope(envelope);
  return freeze({...checked.snapshot,cutsceneEnvelope:checked});
}
