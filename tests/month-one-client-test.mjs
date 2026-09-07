import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = (await fs.readFile(new URL('../recap/month-1/recap.js',import.meta.url),'utf8'))
  .replace(/^import .*;\n/gm,'');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    hidden: false, innerHTML: '', textContent: '', attributes: {},
    setAttribute(name,value) { this.attributes[name]=value; },
    addEventListener() {}, replaceChildren() { this.innerHTML=''; }
  });
  return elements.get(id);
}
const scheduled = new Map();
let sequence = 0;
let authCallback;
let resolveRequest;
let calls = 0;
const context = vm.createContext({
  supabase: {
    rpc() { calls++; return new Promise(resolve => { resolveRequest=resolve; }); },
    auth: { onAuthStateChange(callback) { authCallback=callback; return {data:{subscription:{unsubscribe(){}}}}; } }
  },
  document: {hidden:false,getElementById:element,addEventListener(){}},
  window: {addEventListener(){}},
  location: {hash:'',origin:'https://example.test'},
  history: {replaceState(){}},
  navigator: {},
  setTimeout(callback,delay) { const id=++sequence; scheduled.set(id,{callback:()=>{ scheduled.delete(id); callback(); },delay}); return id; },
  clearTimeout(id) { scheduled.delete(id); },
  // Deliberately a wildly incorrect browser clock. Status must remain server-driven.
  Date: class extends Date { static now() { return 999999999999999; } },
  globalRecap: data => `global:${data.status}`,
  personalRecap: data => data.personal?.username ?? 'signed out',
  shareSummary(){},summarySvg(){}
});
vm.runInContext(source,context);
const settle = async payload => {
  resolveRequest(payload);
  await new Promise(resolve=>setImmediate(resolve));
};
const response = status => ({data:{global:{},personal:{username:'One'},status,
  asOf:'2026-09-07T12:00:00Z',refreshSeconds:status==='live'?45:null},error:null});
await settle(response('live'));
assert.match(element('recap-status').textContent,/^LIVE/);
assert.equal([...scheduled.values()].at(-1).delay,45000);
assert.equal(calls,1);

// An account switch immediately clears the previous private DOM and rejects its
// in-flight response, then queues a request for the new authenticated session.
vm.runInContext('view="personal"; render(); refresh();',context);
assert.equal(element('recap-content').innerHTML,'One');
authCallback('SIGNED_OUT');
assert.equal(element('recap-content').innerHTML,'');
await settle(response('live'));
assert.equal(element('recap-content').innerHTML,'');
const queued=[...scheduled.values()].at(-1);
assert.equal(queued.delay,0);
queued.callback();
const signedOut=response('final'); signedOut.data.personal=null;
await settle(signedOut);
assert.equal(element('recap-content').innerHTML,'signed out');
assert.match(element('recap-status').textContent,/^FINAL/);
assert.equal(scheduled.size,0);

// A transient failure is visible and retried, never interpreted as a final freeze.
vm.runInContext('data=null; refresh();',context);
await settle({data:null,error:{message:'network failure'}});
assert.equal(element('recap-error').hidden,false);
assert.equal(element('retry').hidden,false);
assert.equal([...scheduled.values()].at(-1).delay,45000);
console.log('Month One client: 45-second refresh, server-driven finality, account-switch races and retry passed.');
