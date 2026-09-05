import { create, step, visible, ranking, check } from './engine.js';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const response=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers});
const unwrap=(r:any)=>{if(r.error)throw new Error(r.error.message);return r.data;};
const row=(r:any)=>{const data=unwrap(r);return Array.isArray(data)?data[0]:data;};
export function createHandler(admin:any,clock=()=>Date.now()) {return async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return response({error:'Method not allowed'},405);
 try {
 const token=req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
 const auth=token?await admin.auth.getUser(token):null;
 if(auth?.error||!auth?.data?.user||auth.data.user.is_anonymous)return response({error:'Sign in to play minigames.'},401);
 const user=auth.data.user.id;
 const [pr,br]=await Promise.all([admin.from('players').select('id').eq('id',user).maybeSingle(),admin.from('user_roll_luck_rarity_mult').select('active_until').eq('player_id',user).maybeSingle()]);
 check(unwrap(pr),'Open Roll to finish creating your profile.');const ban=unwrap(br);check(!ban?.active_until||Date.parse(ban.active_until)<=clock(),'Account suspended.');
 const raw=await req.text();check(raw.length<=64000,'Request too large');const b=JSON.parse(raw);
 let run=null;
 if(b.action==='start'){
 let gems:any[]=[],mutations:any[]=[];
 if(b.game==='price-is-right'){
  const gr=await admin.from('private_feature_gems').select('name,rarity,base_weight,value_per_gram').eq('enabled',true).order('rarity').limit(1000);
  const mr=await admin.from('game_mutations').select('*').eq('enabled',true);gems=unwrap(gr);mutations=unwrap(mr);
 }
 const seed=crypto.getRandomValues(new Uint32Array(1))[0];
 const state=create(b.game,b.mode,b.options,seed,clock(),gems,mutations);
 run=row(await admin.rpc('minigame_start',{p_player:user,p_game:b.game,p_mode:b.mode,p_state:state}));
 }else if(b.action==='act'){
 check(typeof b.run_id==='string'&&Number.isInteger(b.version));
 run=unwrap(await admin.from('minigame_runs').select('*').eq('id',b.run_id).eq('player_id',user).single());
 if(run.version===b.version&&run.status==='active'){
 const next=step(run.state,b.input,clock());
 run=row(await admin.rpc('minigame_commit',{p_player:user,p_run:run.id,p_version:b.version,p_action:b.input,p_state:next,p_rank:ranking(next)}));
 }
 }else check(['state','board'].includes(b.action),'Unknown action');
 const wallet=row(await admin.rpc('minigame_wallet',{p_player:user}));
 if(b.action==='state'){
 const rows=unwrap(await admin.from('minigame_runs').select('*').eq('player_id',user).eq('status','active'));
 return response({wallet,server_now:clock(),runs:rows.map(pack)});
 }
 const board=b.game&&b.game!=='crystal-bags'?unwrap(await admin.rpc('minigame_board',{p_game:b.game,p_player:user})):null;
 let stats=null;
 if(b.game==='crystal-bags'){
 stats=unwrap(await admin.rpc('minigame_bag_stats',{p_player:user}));
 }
 return response({wallet,run:run?pack(run):null,board,stats,server_now:clock()});
 }catch(e){return response({error:e instanceof Error?e.message:'Minigames unavailable'},400);}
 };}
const pack=(r:any)=>({id:r.id,version:r.version,game:r.game,mode:r.mode,state:visible(r.state)});
