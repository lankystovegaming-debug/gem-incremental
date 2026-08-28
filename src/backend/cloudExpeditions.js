import { supabase } from "./supabase.js";
const MESSAGES={insufficient_funds:"You do not have enough money for that operation.",mine_depth_out_of_sequence:"That depth is not ready for funding.",mine_route_unavailable:"This route decision is no longer available.",invalid_mine_route:"That route is not valid here.",supply_camp_unavailable:"That checkpoint service is no longer available.",invalid_camp_service:"That Supply Camp service is not valid.",mine_overdepth_unavailable:"Mine Overdepth is not available yet.",mine_not_active:"That expedition is no longer active.",mine_not_extracted:"Extract before settling the expedition."};
function normalise(error){if(!error)return null;const code=Object.keys(MESSAGES).find(value=>error.message?.includes(value))??error.code;return{code,message:MESSAGES[code]??"The expedition request could not be completed."};}
async function rpc(name,args){const{data,error}=await supabase.rpc(name,args);return{data,error:normalise(error)};}
export const loadExpeditionDashboard=()=>rpc("get_abandoned_mine_dashboard");
export const fundMineDepth=depth=>rpc("fund_abandoned_mine",{p_depth:depth});
export const chooseMineRoute=(runId,route)=>rpc("choose_abandoned_mine_route",{p_run_id:runId,p_route:route});
export const chooseSupplyCampService=(runId,service)=>rpc("choose_abandoned_mine_camp_service",{p_run_id:runId,p_service:service});
export const continueMineOverdepth=runId=>rpc("continue_mine_overdepth",{p_run_id:runId});
export const extractMine=(runId,forced=false)=>rpc("extract_abandoned_mine",{p_run_id:runId,p_forced:forced});
export const settleMine=runId=>rpc("settle_abandoned_mine",{p_run_id:runId});
