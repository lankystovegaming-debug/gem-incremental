// Local visual QA only. Serves real profile code with isolated fixture RPCs.
// No Supabase requests, accounts, or production writes are made by this harness.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
const fixture = JSON.parse(readFileSync(resolve(root,'artifacts/cosmetics-preview.json'),'utf8'));
const mock = `const fixture=${JSON.stringify(fixture)};
let profile=fixture.profile, mine=fixture.mine;
export const SUPABASE_URL='http://localhost:5517';
export const SUPABASE_PUBLISHABLE_KEY='local-test';
export const supabase={auth:{getSession:async()=>({data:{session:new URLSearchParams(location.search).has('visitor')?null:{user:{id:profile.id}}}})},rpc:async(name,args)=>{
 if(name==='get_public_profile')return {data:profile};
 if(name==='get_my_cosmetics')return {data:mine};
 if(name==='set_my_cosmetic_loadout'){
  mine.equipment=args.p_equipment;
  const item=id=>mine.owned.find(x=>x.id===id)||null;
  profile.cosmetics={...Object.fromEntries(['title','frame','background','decor'].map(k=>[k,item(mine.equipment[k])])),badges:mine.equipment.badges.map(item),trophies:mine.equipment.trophies.map(item),showcase_labels:mine.equipment.showcase_labels};
  mine.resolved=profile.cosmetics;return {data:profile.cosmetics};
 }return {data:[]};}};`;
http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const headers={'Cache-Control':'no-store'};
 if(pathname==='/src/backend/supabase.js'||pathname==='/src/ui/shell.js'){
  res.writeHead(200,{...headers,'Content-Type':'text/javascript'});return res.end(pathname.includes('supabase')?mock:'export function mountShell() {}');
 }
 const path=resolve(root,'.'+(pathname.startsWith('/user/')&&!extname(pathname)?'/user/index.html':pathname));
 if(!path.startsWith(root+'/')||!existsSync(path)){res.writeHead(404);return res.end('Not found');}
 res.writeHead(200,{...headers,'Content-Type':({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});res.end(readFileSync(path));
}).listen(5517,'127.0.0.1',()=>console.log('Isolated profile preview at http://localhost:5517/user/'+fixture.profile.id));
