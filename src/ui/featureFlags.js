import { supabase } from "../backend/supabase.js";
import { ensurePlayerAuth } from "../backend/auth.js";

let request=null;

export function loadFeatureFlags(){
  if(!request){
    request=ensurePlayerAuth().then(()=>supabase.functions.invoke("features",{body:{action:"sections"}}))
      .then(({data})=>new Map((data?.sections??[]).map(section=>[section.id,section.enabled===true])))
      .catch(()=>new Map());
  }
  return request;
}

export async function featureEnabled(id){
  return (await loadFeatureFlags()).get(id)===true;
}
