import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { NEPTUNE_RECIPE } from "../src/data/deepSea.js";

// Exercise the actual page code with a small DOM and controllable requests.
const nodes=new Map(),listeners=new Map(),timeouts=new Map(),intervals=[];
let nextTimer=0,calls=[],reply=null;
const clone=x=>JSON.parse(JSON.stringify(x));
const state={neptune_owned:false,neptune_auto_feed:true,neptune_auto_craft:false,tide_tokens:0,depth_step:0};
const snapshot={phase:"active",state,serverNow:"2026-10-12T00:00:00Z",run:{ends_at:"2026-10-24T00:00:00Z"},progress:[],gems:[]};
function node(id){
  if(!nodes.has(id)){
    const classes=new Set(id==="neptune-panel"?["hidden"]:[]);
    nodes.set(id,{id,checked:false,disabled:false,textContent:"",innerHTML:"",value:"",dataset:{},classList:{
      contains:name=>classes.has(name),
      toggle(name,enabled){if(enabled??!classes.has(name))classes.add(name);else classes.delete(name);}
    }});
  }
  return nodes.get(id);
}
const document={hidden:false,getElementById:node,
  querySelector:()=>node("neptune-panel"),querySelectorAll:()=>[],
  addEventListener(type,listener){listeners.set(type,[...(listeners.get(type)||[]),listener]);}
};
const window={addEventListener:document.addEventListener,dispatchEvent(){}};
const context=vm.createContext({document,window,console,NEPTUNE_RECIPE,queueMicrotask,
  mountShell(){},getSettings:()=>({}),updateSettings:async()=>{},invokeFunction:async()=>({}),CustomEvent:class{},
  deepSeaRequest:async(action="snapshot",payload)=>{calls.push({action,payload});return reply?reply(action,payload):clone(snapshot);},
  setTimeout(fn,delay){const id=++nextTimer;timeouts.set(id,{fn,delay});return id;},
  clearTimeout:id=>timeouts.delete(id),setInterval(fn,delay){intervals.push({fn,delay});return intervals.length;},clearInterval(){},
});
const source=readFileSync(new URL("../limited-events/deep-sea/deep-sea.js",import.meta.url),"utf8").replace(/^import .*;\n/gm,"");
vm.runInContext(source,context);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
await flush();
assert.equal(calls.length,1);
assert.equal(node("neptuneFeed").checked,true);
const poll=intervals.find(x=>x.delay===5000).fn;
poll();await flush();
assert.equal(calls.length,1,"hidden Neptune panel must not poll");
node("neptune-panel").classList.toggle("hidden",false);
snapshot.progress=[{target:"neptune",gem_name:"Clay",quantity:17}];
poll();await flush();
assert.equal(calls.at(-1).action,"neptuneProgress");
assert.match(node("recipe").innerHTML,/17 \/ 500/);
const count=calls.length;
document.hidden=true;poll();await flush();
assert.equal(calls.length,count);
document.hidden=false;

// Batch subroll events are throttled into one refresh, without debounce starvation.
const rollListener=listeners.get("gem:roll-complete")[0];
rollListener();rollListener();rollListener();
const queued=[...timeouts.values()].filter(x=>x.delay===1000);
assert.equal(queued.length,1);
queued[0].fn();await flush();
assert.equal(calls.length,count+1);

// An old snapshot arriving after a mutation cannot reset the new checkbox.
let releaseOld;
reply=async action=>action==="neptuneProgress"?new Promise(resolve=>{releaseOld=resolve;}):{...clone(snapshot),state:{...state,neptune_auto_craft:true}};
poll();await flush();
node("neptuneAutoCraft").checked=true;
await node("neptuneAutoCraft").onchange({target:node("neptuneAutoCraft")});
assert.equal(node("neptuneAutoCraft").checked,true);
releaseOld(clone(snapshot));await flush();
assert.equal(node("neptuneAutoCraft").checked,true,"stale refresh cannot overwrite an action result");
reply=async()=>{throw new Error("backend unavailable");};
node("neptuneAutoCraft").checked=false;
await node("neptuneAutoCraft").onchange({target:node("neptuneAutoCraft")});
assert.equal(node("neptuneAutoCraft").checked,true,"failed mutation restores server setting");
assert.equal(node("neptuneAutoCraft").disabled,false);
reply=async()=>({...clone(snapshot),state:{...state,neptune_owned:true},progress:[{target:"neptune",gem_name:"Clay",quantity:500}]});
poll();await flush();
assert.equal(node("depositNeptune").disabled,true);
assert.equal(node("craftNeptune").disabled,true);
assert.match(node("neptuneStatus").textContent,/has been forged/);
console.log("Neptune panel live refresh, hidden-tab throttling and stale-response checks passed.");
