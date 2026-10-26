const supabaseStub = String.raw`
window.__utilityActions=[];
const user={id:'mobile-test-player',is_anonymous:false,identities:[{}]};
const inventory=Array.from({length:92},(_,i)=>({id:i+1,gem_name:i===90?'VeryLongGemName'.repeat(12):'Quartz '+(i+1),rarity:2+(i%10),base_weight:10,value_per_gram:1,final_weight:10+i,value:i===90?999999999999999:10+i,mutation_ids:[],mutation_multipliers:{},locked:i===91,created_at:new Date(Date.now()-i*1000).toISOString()}));
const raritySteps=[2,20,200,2000,20000,200000,2000000,20000000,200000000,2000000000,20000000000];
const catalog=Array.from({length:880},(_,i)=>{
 const rarity=raritySteps[i%raritySteps.length];
 const name='Catalog Gem '+String(i+1).padStart(4,'0');
 return {id:i+1,name,title:'',rarity,base_weight:10,value_per_gram:1,description:name+' specimen',metadata:{},hide_rarity_until_discovered:false,affected_by_luck:true,enabled:true,sort_order:i,availability_mode:'always'};
});
const settingsCatalog=inventory.map(g=>({name:g.gem_name,rarity:g.rarity}));
function tableResult(table){
 if(table==='player_equipment')return {data:[{id:'tool',equipment_id:'crude-pickaxe',name:'LongEquipmentName'.repeat(10),category:'pickaxe',tier:1,equipped:true},{id:'boots',equipment_id:'miners-boots',name:'Stored boots',category:'boots',tier:1,equipped:false}],error:null};
 if(table==='inventory_gems')return {data:inventory,error:null};
 if(table==='players')return {data:{inventory_capacity:120,money:12345,total_rolls:1000,next_roll_at:null},error:null};
 if(table==='player_gem_mutation_combinations')return {data:catalog.slice(0,8).map((g,i)=>({id:i+1,gem_name:g.name,combination_key:'none',mutation_ids:[],mutation_multipliers:{},total_found:1,highest_value:10,first_discovered_at:new Date().toISOString()})),error:null};
 if(table==='player_settings')return {data:{settings:{autoRoll:false,batchSize:1,autoKeep:true,autoKeepEffectiveRarity:1000000,rollAnimations:true,cutsceneMinimumRarity:100000,globalCash:true,cashGraph:false,gemRealism:'classic'}},error:null};
 if(table==='announcements')return {data:[{id:1,body:'Community https://discord.gg/example',tone:'info',created_at:new Date().toISOString()}],error:null};
 return {data:[],error:null,count:0};
}
function chain(result){return new Proxy(function(){},{get(_t,key){if(key==='then')return (ok,fail)=>Promise.resolve(result).then(ok,fail);if(key==='subscribe')return ()=>({});return ()=>chain(result);},apply(){return chain(result);}})}
function rpcResult(name){
 if(name==='get_public_gem_catalog')return {data:catalog,error:null};
 if(name.includes('mutation_catalog'))return {data:[{id:'polished',name:'Polished',chance:20,multiplier:2,description:'',icon:'✦',color:'#ddd',enabled:true}],error:null};
 if(name==='get_qol_gem_catalog')return {data:settingsCatalog,error:null};
 if(name==='get_global_cash_feed')return {data:{total:100000,cash:50000,online:12,events:[{id:1,name:'Tester',gem:'Quartz',amount:20}]},error:null};
 return {data:null,error:null};
}
export const SUPABASE_URL='https://example.invalid';
export const SUPABASE_PUBLISHABLE_KEY='test';
export async function loadEnabledProviders(){return {}};
export const supabase={
 auth:{async getSession(){return {data:{session:{user}},error:null}},async getUser(){return {data:{user},error:null}},onAuthStateChange(cb){queueMicrotask(()=>cb('SIGNED_IN',{user}));return {data:{subscription:{unsubscribe(){}}}}},async signOut(){return {error:null}}},
 from(table){return chain(tableResult(table))},rpc(name){window.__utilityActions.push(name);return chain(rpcResult(name))},
 functions:{async invoke(name){window.__utilityActions.push(name);if(name==='features')return {data:{sections:[],isAdmin:false},error:null};return {data:null,error:null}}},
 channel(){return chain({data:null,error:null})},removeChannel(){}
};`;

const authStub = `
export async function ensurePlayerAuth(){return {id:'mobile-test-player',is_anonymous:false,identities:[{}]}}
export function getLastAuthError(){return null}
export function isSignInRequired(){return false}
export const SIGN_IN_REQUIRED_MESSAGE="Log in or create a free account to start playing.";
export async function waitForAuthReady(){return ensurePlayerAuth()}
`;

export async function prepareUtilityPage(page) {
  await page.route("**/src/backend/supabase.js", route => route.fulfill({ contentType: "text/javascript", body: supabaseStub }));
  await page.route("**/src/backend/auth.js", route => route.fulfill({ contentType: "text/javascript", body: authStub }));
  await page.route("**/src/ui/dailyLogin.js", route => route.fulfill({ contentType: "text/javascript", body: "export async function mountDailyLogin(){}" }));
  await page.route("**/src/ui/referralPromo.js", route => route.fulfill({ contentType: "text/javascript", body: "export async function mountReferralPromo(){}" }));
  await page.route("**/src/ui/tour.js", route => route.fulfill({ contentType: "text/javascript", body: "export function mountTour(){} export function startTour(){} export function startAccountPrompt(){}" }));
}
