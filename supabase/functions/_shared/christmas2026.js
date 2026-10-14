// Server-only Christmas rules. Never import this module into the browser: it
// contains unreleased rewards and hidden acquisition probabilities.
export const START = Date.parse('2026-12-01T00:00:00Z');
export const END = Date.parse('2026-12-31T16:00:00Z');
export const MORNING = Date.parse('2026-12-25T00:00:00Z');
export const STORM_START = Date.parse('2026-12-24T00:00:00Z');
export const FINALE_END = Date.parse('2027-01-07T16:00:00Z');
export const phase = now => now < START ? 'teaser' : now < END ? 'active' : 'archived';
export const wave = now => phase(now) !== 'active' ? 0 : now >= MORNING ? 4 : now >= Date.parse('2026-12-15T00:00:00Z') ? 3 : now >= Date.parse('2026-12-08T00:00:00Z') ? 2 : 1;
export const eventDay = now => Math.floor((now - START) / 86400000) + 1;
export const eventWeek = now => Math.floor((now - START) / (7 * 86400000));
export const finaleEligible = (now, genuineRolls, acknowledged) => now >= END && now < FINALE_END && genuineRolls > 0 && !acknowledged;

// Null means unconfirmed, not zero and not a default schedule. Configuration
// must be supplied explicitly before publishing any Christmas occurrences.
export const SCHEDULING = Object.freeze({rushFrequency: null, rushDurationMinutes: null, rushSpacingMinutes: null, auroraSpacingMinutes: null, stormSpacingMinutes: null, aurorasPerDay: 2, storms: 6, durationMinutes: 20, warningMinutes: 5});
export const TREE_COSTS = [
  [100,0,0],[150,2,0],[200,4,0],[250,6,0],[300,8,1],
  [400,10,1],[500,14,2],[600,18,2],[700,22,3],[800,28,4],
  [900,32,5],[1000,36,6],[1100,40,7],[1200,44,8],[1300,48,9],
  [1400,54,11],[1500,58,12],[1600,62,13],[1700,66,15],[1800,70,16],
  [2000,75,17],[2200,80,19],[2400,90,22],[2700,105,24],[3200,128,28]
].map(([snowflakes,ornaments,lights]) => ({snowflakes,ornaments,lights}));
export const TREE_REWARDS = [
  {small:2},{shillings:500},{small:3},{festive:1},{'candy-cane-garland':1,shillings:1500},
  {small:5},{cocoa:1},{festive:2},{shillings:2500},{evergreen:1},
  {large:1},{cocoa:2},{shillings:4000},{festive:3},{'tree-star':1,'christmas-tree-badge':1},
  {large:1,cocoa:1},{shillings:6000},{toolkit:1},{large:2},{'winters-blessing':1,golden:1},
  {shillings:10000},{golden:1},{toolkit:2},{golden:1,shillings:15000},
  {'christmas-tree-2026':1,'tree-topper':1,'tree-decorator-2026':1}
];
export const ADVENT = [
  {small:3},{shillings:500},{small:5},{festive:1},{shillings:1000,festive:1},
  {cocoa:1},{small:5},{festive:2},{shillings:1500},{mysterious:1},
  {festive:2},{cocoa:2},{shillings:2000},{large:1},{tonic:1,large:1},
  {festive:3},{shillings:2500},{toolkit:1},{large:1},{mysterious:2},
  {golden:1},{shillings:4000},{golden:1,cocoa:2},{mysterious:3,shillings:5000},
  {'north-star-ornament':1,christmas:1,golden:1,shillings:10000,'merry-christmas':1}
];
export const PRESENT_POINTS = Object.freeze({small:1,festive:5,large:25,golden:125});
export const PRESENT_ODDS = Object.freeze({normal:[5000,40000,100000,1000000],boosted:[40,200,1000,10000]});
const gem = (name,rarity,baseWeight,valuePerGram,wave,source='roll') => ({name,rarity,baseWeight,valuePerGram,wave,source});
export const GEMS = [
  gem('Snowball',1250,250,2,1),gem('Icicle',4000,150,10,1),gem('Mistletoe',12500,50,100,1),gem('Candy Cane Ore',40000,400,50,1),
  gem('Gingerbreadite',125000,500,100,1),gem('Glass Ornament',500000,100,2000,1),gem('Snow Globe',2500000,750,1000,1),gem('First Snow',12250000,250,12000,1),
  gem('Wrapping Paper',25000,50,200,2),gem('Jingle Bell',250000,250,400,2),gem('Toymaker Crystal',1000000,200,2000,2),gem('Nutcracker',4000000,1000,1000,2),gem('Reindeer Antler',15000000,750,5000,2),gem('Sleighbell',40000000,400,25000,2),gem('Workshop Star',100000000,100,250000,2),
  gem('Frostfire',20000000,400,10000,3),gem('Polar Prism',75000000,1000,12000,3),gem('Frozen Aurora',175000000,350,100000,3),gem('North Star',300000000,125,400000,3),gem("Winter's Heart",500000000,2000,40000,3),gem('Aurora Borealis',750000000,750,160000,3),
  gem('Guiding Star',250000000,250,250000,4),gem('Yuletide',676767676,676,200000,4),gem('Eternal Christmas',1225000000,1225,200000,4),gem('Wrapped Miracle',12250000,2500,2500,4,'christmas-day'),
  // These sources have no ordinary-pool rarity. Never substitute their
  // acquisition denominators as catalogue rarity.
  gem('Celestine Veil',null,500,400000,3,'aurora'),gem('Wish Upon a Star',null,2500,100000,4,'christmas-present'),gem('Christmas Singularity',null,1225,250000,0,'bottled-christmas')
];
export function eligibleGems(now) {
  const w = wave(now);
  return GEMS.filter(g => w && g.wave <= w && (g.source === 'roll' || g.source === 'christmas-day' && now >= MORNING && now < MORNING + 16*3600000));
}
export const CONSUMABLES = {
  cocoa:{rolls:250,speed:1.1,presentBonus:.25},cookie:{rolls:250,luck:1.15,christmasLuck:1.25},
  peppermint:{rolls:150,mutation:1.35},rations:{rolls:500,speed:1.15},snowstorm:{rolls:150,weightMultiplier:1.3,christmasWeightMultiplier:1.4},
  toolkit:{rolls:250,mutation:1.2,tierUp:.2},tonic:{rolls:250,weightLuck:1.5,christmasValue:1.25},
  bell:{rolls:500,period:100,weightLuck:10},coin:{rolls:500,minimumRarity:1000000},
  miracle:{rolls:250,luck:1.5,weightLuck:1.5,mutation:1.5,speed:1.1},magnet:{rolls:500,presentBonus:1,christmasOnly:true},
  list:{presents:10,christmasOnly:true},stash:{rolls:1,flatLuck:100000,weightLuck:5,mutation:3},
  'bottled-christmas':{rolls:1,flatLuck:250000,weightLuck:10,mutation:5,weightMultiplier:2}
};
export const EQUIPMENT = {
  evergreen:{category:'pickaxe',luck:18,speed:2.6,weightLuck:1,weightMultiplier:3.5,mutation:1.3,presentBonus:.35,smallEvery:250},
  'star-lantern':{category:'lantern',speed:1.2,rushSpeed:1.1},
  'snowdrift-boots':{category:'boots',weightLuck:1.35,christmasWeightLuck:1.1},
  'santa-sack':{category:'bag',weightMultiplier:1.15,tierUp:.1,unlockPP:1000}
};
export const SHOP = [
  ['small',300,10],['festive',1500,5],['large',7500,2],['golden',35000,1],['cocoa',4000,5],['cookie',6000,5],['peppermint',7500,4],['rations',7500,4],['toolkit',12500,3],['tonic',15000,3],['magnet',10000,3],['list',15000,2]
].map(([id,price,limit]) => ({id,price,limit,weekly:true})).concat([
  ['star-lantern',20000],['festive-title',10000],['snowfall-frame',30000],['aurora-chaser',40000],['workshop-roll-button',50000],['aurora-gem-card',75000],['north-pole-background',125000],['christmas-2026-collector',200000],['the-christmas-star',350000]
].map(([id,price]) => ({id,price,limit:1,weekly:false})),[
  {id:'christmas',price:25000,subsequentPrice:50000,limit:6,weekly:false,startsAt:MORNING},
  {id:'supply-crate',price:25000,limit:null,weekly:false},
  {id:'emergency-supply',enabled:false,price:null,limit:null}
]);

function uniform(random) {
  const n = random();
  if (!Number.isFinite(n) || n < 0 || n >= 1) throw new Error('invalid_random');
  return n;
}
function integer(min,max,random) {return min + Math.floor(uniform(random) * (max-min+1));}
function pick(entries,random) {
  const total=entries.reduce((s,[p])=>s+p,0);let draw=uniform(random)*total;
  for(const [p,reward] of entries) {draw-=p;if(draw<0)return reward;}
  return entries.at(-1)[1];
}
function add(a,b) {for(const [id,n] of Object.entries(b))a[id]=(a[id]||0)+n;return a;}
const goldenPremium = [[20,{cocoa:1}],[17.5,{toolkit:1}],[15,{tonic:1}],[12.5,{peppermint:1}],[10,{bell:1}],[10,{coin:1}],[10,{list:1}],[5,{miracle:1}]];
// Polish and the utility/Workshop bundles still need authoritative definitions.
// Symbolic rewards intentionally do not turn into invented premium rewards.
const christmasPremium = [[20,{toolkit:1}],[20,{tonic:1}],[15,{polish:1}],[15,{bell:1}],[12.5,{coin:1}],[12.5,{miracle:1}],[5,{'cocoa-utility-bundle':1}]];
export function openPresent(tier,random) {
  let r,bonus;
  if(tier==='small') {
    r={snowflakes:integer(8,15,random)};
    bonus=pick([[70,{snowflakes:integer(5,10,random)}],[25,{ornaments:1}],[5,{lights:1}]],random);
  } else if(tier==='festive') {
    r={snowflakes:integer(30,50,random),ornaments:integer(1,2,random)};
    bonus=pick([[45,{ornaments:integer(1,2,random)}],[30,{lights:1}],[12,{small:2}],[10,{cookie:1}],[3,{large:1}]],random);
  } else if(tier==='large') {
    r={snowflakes:integer(100,160,random),ornaments:integer(4,7,random),lights:1};
    bonus=pick([[32,{lights:2}],[25,{ornaments:integer(4,6,random)}],[15,{festive:2}],[8,{shillings:integer(500,1000,random)}],[5,{snowstorm:1}],[8,{rations:1}],[5,{magnet:1}],[2,{golden:1}]],random);
  } else if(tier==='golden') {
    r={snowflakes:integer(400,600,random),ornaments:integer(15,25,random),lights:5};
    bonus=pick([[40,{lights:5}],[25,{shillings:integer(2500,4000,random)}],[15,{large:2}],[10,{'golden-cosmetic':1}],[9,'premium'],[1,{stash:1}]],random);
    if(bonus==='premium')bonus=pick(goldenPremium,random);
  } else if(tier==='christmas') {
    r={snowflakes:integer(750,1250,random),ornaments:integer(25,40,random),lights:integer(5,8,random),shillings:integer(2500,5000,random),golden:1};
    bonus=pick([[35,{golden:2}],[25,'premium'],[15,{shillings:10000}],[10,{'christmas-cosmetic':1}],[8,{'workshop-package':2}],[5,{'christmas-collectible':1}],[2,{'wish-upon-a-star':1}]],random);
    if(bonus==='premium')bonus=add({...pick(christmasPremium,random)},pick(christmasPremium,random));
    // Acquisition only. No Singularity random draw and no armed Bottle state.
    if(uniform(random)<1/250)r['bottled-christmas']=1;
  } else throw new Error('invalid_present');
  return add(r,bonus);
}
export function openPackage(random) {
  return add({snowflakes:integer(50,100,random),ornaments:integer(2,4,random),shillings:integer(250,500,random)},
    pick([[35,{small:2}],[25,{festive:1}],[15,{cocoa:1}],[10,{peppermint:1}],[7,{rations:1}],[5,{tonic:1}],[2,{large:1}],[1,{miracle:1}]],random));
}
export function openSupplyCrate(random) {
  return {...pick([[25,{cocoa:2}],[20,{cookie:2}],[15,{rations:2}],[12,{peppermint:2}],[10,{toolkit:1}],[7,{tonic:1}],[5,{bell:1}],[3,{coin:1}],[2,{miracle:1}],[1,{toolkit:1,tonic:1,miracle:1}]],random)};
}
export function shillingsForValue(finalValue) {
  if(!Number.isFinite(finalValue)||finalValue<0)throw new Error('invalid_specimen_value');
  return Math.max(1,Math.floor(2*(finalValue/1000)**.75));
}
export function presentMultiplier(bonuses=[]) {
  if(bonuses.some(n=>!Number.isFinite(n)||n<0))throw new Error('invalid_present_bonus');
  return 1+bonuses.reduce((s,n)=>s+n,0);
}
export function naturalPresents({boosted=false,bonuses=[],sack=false,toolkit=false,listCharges=0,storm=false},random) {
  const rewards={};let consumed=0;
  const tiers=Object.keys(PRESENT_POINTS),odds=PRESENT_ODDS[boosted?'boosted':'normal'];
  const multiplier=presentMultiplier(bonuses);
  for(let i=0;i<tiers.length;i++) {
    if(uniform(random)>=Math.min(1,multiplier/odds[i]))continue;
    let upgrade=false;
    if(listCharges>consumed){upgrade=true;consumed++;}
    else {const sackUpgrade=sack&&uniform(random)<.1,toolkitUpgrade=toolkit&&uniform(random)<.2;upgrade=sackUpgrade||toolkitUpgrade;}
    add(rewards,{[tiers[Math.min(tiers.length-1,i+Number(upgrade))]]:1});
  }
  if(storm&&uniform(random)<1/25000)add(rewards,{mysterious:1});
  return {rewards,listChargesConsumed:consumed};
}
export function combinePlan(tier,owned,count) {
  const tiers=Object.keys(PRESENT_POINTS),index=tiers.indexOf(tier);
  if(index<0||index===3||!Number.isSafeInteger(owned)||owned<0)throw new Error('invalid_combine');
  const groups=count==='max'?Math.floor(owned/5):count;
  if(!Number.isSafeInteger(groups)||groups<1||groups*5>owned)throw new Error('invalid_combine');
  return {consume:groups*5,grant:groups,tier:tiers[index+1],presentPoints:0};
}
export function bottleUseOutcome({explicitUse=false,genuineRoll=false},random) {
  if(!explicitUse||!genuineRoll)return {singularity:false};
  return {singularity:uniform(random)<1/25};
}
export function collection(gems,discovered,now) {
  return gems.filter(g=>g.source==='roll'||g.source==='christmas-day'
    ? (phase(now)==='archived'||g.wave<=wave(now))
    : discovered.has(g.name)).map(g=>discovered.has(g.name)?{name:g.name,wave:g.wave,baseWeight:g.baseWeight,valuePerGram:g.valuePerGram,...(g.rarity?{rarity:g.rarity}:{})}:{name:g.name,wave:g.wave});
}
