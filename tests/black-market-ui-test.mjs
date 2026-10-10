import assert from "node:assert/strict";

const { chromium } = await import(
  process.env.BLACK_MARKET_PLAYWRIGHT_MODULE || "playwright"
);

const base = process.env.BLACK_MARKET_PREVIEW_URL || "http://127.0.0.1:5500/";
const userId = "00000000-0000-0000-0000-000000000001";
const sellerId = "00000000-0000-0000-0000-000000000002";

const authStub = `
export async function ensurePlayerAuth(){return {id:"${userId}",is_anonymous:false,identities:[{}]}}
export function isSignInRequired(){return false}
export const SIGN_IN_REQUIRED_MESSAGE="Sign in required";
`;

const shellStub = `
export function mountShell(){return {setWallet(value){window.__wallet=value}}}
`;

function supabaseStub(open) {
  return `
window.__rpcCalls=[];
const user={id:"${userId}",is_anonymous:false,identities:[{}]};
const gem={id:11,serial_number:2,gem_name:"Quartz",rarity:10,effective_rarity:10,base_weight:10,value_per_gram:10,rolled_weight_multiplier:1,rolled_weight:10,final_weight:10,value:100,mutation_id:null,mutation_ids:[],mutation_multipliers:{},locked:false,museum_locked:false,created_at:new Date().toISOString()};
const lot=[{...gem,type:"gem"}];
const blackListing={id:31,seller_id:"${sellerId}",seller_name:"Weekend Seller",buyer_id:null,buyer_name:null,lot,item_count:1,item_name:"Quartz",rarity:10,reference_value:100,asking_price:75,listing_fee:2,sale_tax:null,seller_proceeds:null,status:"active",created_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString(),sold_at:null,closed_at:null,closure_reason:null};
const auction={id:21,seller_id:"${sellerId}",seller_name:"Auction Seller",lot,item_count:1,gem_name:"Quartz",rarity:10,lot_reference_value:100,start_price:50,current_bid:null,current_bidder_id:null,current_bidder_name:null,bid_count:0,status:"active",ends_at:new Date(Date.now()+3600000).toISOString(),listing_fee_amount:1,anti_snipe_extension_seconds:0,created_at:new Date().toISOString()};
function resultFor(table){
  if(table==="inventory_gems")return {data:[gem],error:null};
  if(table==="player_consumables")return {data:[],error:null};
  if(table==="players")return {data:{inventory_capacity:15,money:1000,total_rolls:100,next_roll_at:null},error:null};
  if(table==="auctions")return {data:[auction],error:null};
  if(table==="black_market_listings")return {data:[blackListing],error:null};
  return {data:[],error:null};
}
function chain(result){return new Proxy(function(){},{get(_target,key){
  if(key==="then")return (resolve,reject)=>Promise.resolve(result).then(resolve,reject);
  if(key==="maybeSingle"||key==="single")return ()=>Promise.resolve(result);
  return ()=>chain(result);
},apply(){return chain(result)}})}
export const supabase={
  auth:{async getUser(){return {data:{user},error:null}},async getSession(){return {data:{session:{user}},error:null}}},
  from(table){return chain(resultFor(table))},
  async rpc(name,args){window.__rpcCalls.push({name,args});
    if(name==="get_black_market_status")return {data:{open:${open},timezone:"Asia/Singapore",serverNow:"2026-10-05T12:00:00+08:00",opensAt:"2026-10-10T00:00:00+08:00",closesAt:"2026-10-12T00:00:00+08:00"},error:null};
    if(name==="buy_black_market_listing")return {data:{listingId:31,price:75,saleTax:11.25,sellerProceeds:63.75,money:925},error:null};
    if(name==="create_black_market_listing")return {data:{listingId:32,referenceValue:100,askingPrice:100,listingFee:2,money:998},error:null};
    return {data:null,error:null};
  }
};
`;
}

async function prepare(page, open = true) {
  await page.route("**/src/backend/supabase.js", route => route.fulfill({ contentType: "text/javascript", body: supabaseStub(open) }));
  await page.route("**/src/backend/auth.js", route => route.fulfill({ contentType: "text/javascript", body: authStub }));
  await page.route("**/src/ui/shell.js", route => route.fulfill({ contentType: "text/javascript", body: shellStub }));
}

async function exerciseOpenFlow(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await prepare(page, true);
  await page.goto(`${base}auctions/`);
  await page.locator("#blackMarketBanner.is-open").waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `${width}px market page overflowed by ${overflow}px`);

  await page.locator("#browseBlackMarketMode").click();
  await page.locator(".black-market-buy").click();
  assert.match(await page.locator(".dialog__body").innerText(), /transfer together/i);
  await page.locator('.dialog [data-action="confirm"]').click();
  await page.waitForFunction(() => window.__rpcCalls.some(call => call.name === "buy_black_market_listing"));

  await page.locator("#sellTab").click();
  await page.locator("#saleMethodBlack").check();
  assert.equal(await page.locator("#durationField").isHidden(), true);
  assert.equal(await page.locator("#blackMarketDisclosure").isVisible(), true);
  await page.locator('#sellGemList input[data-gem="11"]').check();
  await page.locator("#sellPrice").fill("100");
  await page.locator("#listButton").click();
  assert.match(await page.locator(".dialog__body").innerText(), /Sunday at 11:59:59 PM SGT/);
  assert.match(await page.locator(".dialog__body").innerText(), /Seller receives/);
  await page.locator('.dialog [data-action="confirm"]').click();
  await page.waitForFunction(() => window.__rpcCalls.some(call => call.name === "create_black_market_listing"));

  assert.equal(errors.length, 0, `${width}px page errors: ${errors.join(" | ")}`);
  await page.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await exerciseOpenFlow(browser, 1280);
  await exerciseOpenFlow(browser, 390);

  const closed = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await prepare(closed, false);
  await closed.goto(`${base}auctions/`);
  await closed.locator("#blackMarketBanner").waitFor();
  assert.match(await closed.locator("#blackMarketBanner").innerText(), /Black Market closed/);
  assert.match(await closed.locator("#blackMarketBanner").innerText(), /Saturday/);
  await closed.locator("#sellTab").click();
  assert.equal(await closed.locator("#saleMethodBlack").isDisabled(), true);
  const overflow = await closed.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `closed mobile market overflowed by ${overflow}px`);
  await closed.close();
} finally {
  await browser.close();
}

console.log("PASS: Black Market desktop/mobile browse, purchase, listing, disclosure and closed-state flows");
