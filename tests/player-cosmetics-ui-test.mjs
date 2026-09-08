import assert from 'node:assert/strict';
import { cosmeticHtml, cosmeticStyle, cosmeticRarity } from '../src/ui/cosmetics.js';
const hostile={name:'<img src=x onerror=alert(1)>',description:'" onclick="alert(1)',rarity:'Mythic" onclick="alert(1)',visual_config:{style:'x" onclick="alert(1)',icon:'<svg onload=alert(1)>'}};
const html=cosmeticHtml(hostile,{trophy:true});
assert.ok(!html.includes('<img'));assert.ok(!html.includes('<svg'));assert.ok(html.includes('&lt;img'));assert.equal(cosmeticStyle(hostile),'stone');assert.equal(cosmeticRarity(hostile),'Common');
assert.equal(cosmeticHtml(null),'');
for(const rarity of ['Common','Rare','Epic','Legendary','Mythic','Legacy'])assert.equal(cosmeticRarity({rarity}),rarity);
console.log('Cosmetic rendering escapes content and restricts presentation styles.');
