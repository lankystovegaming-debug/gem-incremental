const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (data, status=200) => Response.json(data,{status,headers});
const uuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const specimenId = value => /^(?:[1-9][0-9]{0,18})$/.test(String(value)) && BigInt(value)<=9223372036854775807n;
const knownErrors = ['bundle_locked','bundle_manual_only','bundle_requirement_not_found','bundle_target_full',
  'invalid_specimen_selection','crown_confirmation_required','bundle_specimen_ineligible','specimen_not_found','player_not_found'];

export async function handleBundles(req, playerId, admin) {
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
  if(req.method!=='POST') return json({error:'method_not_allowed'},405);
  if(!playerId) return json({error:'not_authenticated'},401);
  let body;
  try { body=await req.json(); } catch { return json({error:'invalid_request'},400); }
  if(!body || typeof body!=='object' || Array.isArray(body)) return json({error:'invalid_request'},400);
  const action=body.action??'state';
  let rpc, args={p_player_id:playerId};
  if(action==='summary') {
    if(!uuid(body.playerId)) return json({error:'invalid_request'},400);
    rpc='bundle_public_summary';args={p_player_id:body.playerId};
  } else if(action==='state') rpc='bundle_state';
  else if(['candidates','set_auto','contribute'].includes(action)) {
    if(typeof body.requirementId!=='string'||body.requirementId.length>100) return json({error:'invalid_request'},400);
    args.p_requirement_id=body.requirementId;
    if(action==='candidates') {
      if(body.offset!=null&&(!Number.isInteger(body.offset)||body.offset<0||body.offset>1000000)) return json({error:'invalid_request'},400);
      rpc='bundle_candidates';args.p_offset=body.offset??0;
    } else if(action==='set_auto') {
      if(typeof body.enabled!=='boolean') return json({error:'invalid_request'},400);
      rpc='bundle_set_auto';args.p_enabled=body.enabled;
    } else {
      if(!Array.isArray(body.specimenIds)||body.specimenIds.length<1||body.specimenIds.length>50||
        !body.specimenIds.every(id => (typeof id==='string'||Number.isSafeInteger(id))&&specimenId(id))) return json({error:'invalid_specimen_selection'},400);
      rpc='bundle_contribute';args.p_specimen_ids=body.specimenIds.map(String);args.p_confirm_crown=body.confirmCrown===true;
    }
  } else return json({error:'invalid_action'},400);
  // This allowlist never exposes bundle_route_roll or accepts a client specimen payload.
  try {
    const [{data:section,error:sectionError},{data:ban,error:banError}]=await Promise.all([
      admin.from('game_section_settings').select('enabled').eq('id','collection-hall').maybeSingle(),
      admin.from('user_roll_luck_rarity_mult').select('active_until').eq('player_id',playerId).maybeSingle()
    ]);
    if(sectionError||banError) return json({error:'bundles_unavailable'},503);
    if(section?.enabled===false) return json({error:'bundles_closed'},403);
    if(ban?.active_until&&Date.parse(ban.active_until)>Date.now()) return json({error:'banned'},403);
    const {data,error}=await admin.rpc(rpc,args);
    if(error) {
      const code=knownErrors.find(code=>String(error.message).includes(code));
      if(!code) console.error('Bundle request failed',error);
      return json({error:code??'bundles_unavailable'},code?409:503);
    }
    return json(data);
  } catch(error) {
    console.error('Bundle request failed',error);
    return json({error:'bundles_unavailable'},503);
  }
}
