// Phase 2 transport/serialization only. Phase 3 supplies the trusted evaluator;
// no law formula, catalogue, or browser-provided outcome is accepted here.
export const WORLD2_PIPELINE_RELEASED = false;

export function canonicalRequest(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalRequest).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalRequest(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function requestDigest(request) {
  const bytes = new TextEncoder().encode(canonicalRequest(request));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function normalizeWorld2Request(body) {
  if (!body || !uuid.test(body.requestId) || !Number.isInteger(body.batchSize ?? 1) || (body.batchSize ?? 1) < 1 || (body.batchSize ?? 1) > 100)
    throw new Error('world2_invalid_request');
  if (Object.keys(body).some(k => !['worldId', 'requestId', 'batchSize'].includes(k)) || body.worldId !== 2)
    throw new Error('world2_invalid_request');
  return {worldId: 2, requestId: body.requestId.toLowerCase(), batchSize: body.batchSize ?? 1};
}

// Dependencies are server-owned. priceContext must compute actual speed using
// the approved backend rules, starting from the existing 2.5s base. It is never
// supplied by a request. evaluate gets a fresh cryptographic source per subroll.
export async function executeWorld2Batch({rpc, playerId, body, priceContext, evaluate, randomSource = freshRandomSource}) {
  const request = normalizeWorld2Request(body);
  const digest = await requestDigest(request);
  const base = {p_player_id: playerId, p_request_id: request.requestId, p_digest: digest};
  const call = async (name, args) => {
    const {data, error} = await rpc(name, args);
    if (error) throw new Error(error.message ?? String(error));
    if (data == null) throw new Error('world2_empty_rpc_response');
    return data;
  };
  // Claim performs replay first; null context never accepts a new batch.
  let claim = await call('world2_claim_batch', {...base, p_batch_size: request.batchSize, p_single_cooldown_ms: null, p_context: null});
  for (let attempt = 0; claim.status === 'stale_context' && attempt < 3; attempt++) {
    const context = await call('world2_roll_context', {p_player_id: playerId});
    if (context.status !== 'ready') return context;
    const singleCooldown = await priceContext(context);
    claim = await call('world2_claim_batch', {...base, p_batch_size: request.batchSize, p_single_cooldown_ms: singleCooldown, p_context: context});
  }
  if (claim.status !== 'claimed') return claim;
  const outcomes = [];
  for (let subroll = 0; subroll < request.batchSize; subroll++) {
    const args = {...base, p_subroll: subroll, p_worker_token: claim.workerToken};
    try {
      const context = await call('world2_begin_subroll', args);
      if (context.status === 'replay') { outcomes.push(context.outcome); continue; }
      if (context.status !== 'ready') throw new Error('world2_not_ready');
      // Await each commit before constructing the next RNG or reading state.
      const outcome = await evaluate({context, epoch: claim.epoch, random: randomSource()});
      let committed;
      try { committed = await call('world2_commit_subroll', {...args, p_outcome: outcome}); }
      catch (error) {
        // A lost commit response is uncertain. Lookup the receipt; do not run
        // evaluate again, fall back to another writer, or release the lease.
        const recovery = await call('world2_begin_subroll', args);
        if (recovery.status !== 'replay') throw error;
        committed = recovery.outcome;
      }
      outcomes.push(committed);
    } catch (error) {
      return {status: 'partial', requested: request.batchSize, completed: outcomes.length, outcomes, error: String(error.message ?? error)};
    }
  }
  return {status: 'complete', requested: request.batchSize, completed: outcomes.length, outcomes};
}

export function freshRandomSource() {
  // No persistent seed, batch stream reuse, or client entropy. The evaluator
  // draws independently for every stochastic choice, including rejection draws.
  return () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}
