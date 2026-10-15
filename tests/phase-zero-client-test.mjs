import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const calls=[];
let result={data:[],error:null};
const user={id:'alice'};
const client={
 auth:{getSession:async()=>({data:{session:{user}},error:null})},
 from(table){
  const record={table,steps:[]};calls.push(record);
  const builder={then(resolve,reject){return Promise.resolve(result).then(resolve,reject)}};
  for(const name of ['select','not','order','limit','ilike','in','or','eq','is','range','maybeSingle','update'])builder[name]=(...args)=>{record.steps.push([name,...args]);return builder};
  return builder;
 },
 rpc:async(name,args)=>{calls.push({name,args});return {data:{id:1},error:null}}
};
globalThis.phaseZeroClient=client;
const load=async name=>{
 const source=readFileSync(new URL(`../src/backend/${name}.js`,import.meta.url),'utf8').replace(/^import .* from "\.\/supabase.js";/,'const supabase=globalThis.phaseZeroClient; const loadEnabledProviders=async()=>({});');
 return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};
const dm=await load('privateMessages'),bank=await load('cloudBank'),account=await load('account');
result={data:[{id:'alice',username:'Alice'},{id:'bob',username:'Bob'}],error:null};
assert.deepEqual(await dm.searchPlayers('Bo'),[{id:'bob',username:'Bob'}]);
assert.equal(calls.at(-1).table,'public_player_directory');
assert.ok(calls.at(-1).steps.some(x=>x[0]==='ilike'&&x[2]==='%Bo%'));
assert.equal((await dm.findPlayerByUsername('Bob')).id,'bob');assert.equal(calls.at(-1).table,'public_player_directory');
assert.equal((await bank.searchChequeRecipients('Bob')).data.players[0].id,'bob');assert.equal(calls.at(-1).table,'public_player_directory');
result={data:{username:'Bob'},error:null};assert.equal(await account.loadUsername('bob'),'Bob');assert.equal(calls.at(-1).table,'public_player_directory');
result={data:[],error:null};await dm.markConversationRead('bob');
assert.equal(calls.at(-1).table,'private_messages');assert.deepEqual(Object.keys(calls.at(-1).steps.find(x=>x[0]==='update')[1]),['read_at']);
await dm.markAllPrivateMessagesRead();assert.deepEqual(Object.keys(calls.at(-1).steps.find(x=>x[0]==='update')[1]),['read_at']);
await dm.sendPrivateMessage('bob','hello');assert.equal(calls.at(-1).name,'send_private_message');
// Read conversation names through the projection, keeping message reads unchanged.
result={data:[{sender_id:'bob',recipient_id:'alice',message:'hello',created_at:'2026-10-15'}],error:null};
await dm.loadConversations();assert.deepEqual(calls.slice(-2).map(c=>c.table),['private_messages','public_player_directory']);
console.log('Phase 0 client: DM search/names, cheque search, public usernames, read receipts and controlled send passed.');
