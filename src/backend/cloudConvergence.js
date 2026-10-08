import { supabase } from "./supabase.js";

async function rpc(name,args={}) {
  const {data,error}=await supabase.rpc(name,args);
  if(error) throw new Error(error.message||"Convergence request failed.");
  return data;
}

export const loadConvergenceStatus=()=>rpc("get_convergence_status");
export const loadConvergenceLeaderboard=(limit=100)=>rpc("get_convergence_leaderboard",{p_limit:limit});
export const loadConvergenceCandidates=(offset=0,limit=100)=>rpc("get_convergence_candidates",{p_offset:offset,p_limit:limit});
export const previewConvergenceDonation=(gemIds)=>rpc("preview_convergence_donation",{p_gem_ids:gemIds});
export const donateConvergenceGems=(gemIds,requestKey)=>rpc("donate_convergence_gems",{p_gem_ids:gemIds,p_request_key:requestKey});
export const donateConvergenceCash=(amount,requestKey)=>rpc("donate_convergence_cash",{p_amount:amount,p_request_key:requestKey});
export const setConvergenceAutoCraft=(enabled)=>rpc("set_convergence_auto_craft",{p_enabled:Boolean(enabled)});
export const claimConvergencePickaxe=()=>rpc("claim_convergence_pickaxe");
export const activateConvergenceSurge=()=>rpc("activate_convergence_surge");
