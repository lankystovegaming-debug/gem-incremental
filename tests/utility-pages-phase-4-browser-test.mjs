import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {prepareUtilityPage} from './utility-page-fixtures.mjs';
const {chromium} = await import(process.env.NAVIGATION_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.NAVIGATION_PREVIEW_URL || 'http://127.0.0.1:5500/';
const browser = await chromium.launch({headless:true});
const artifacts = new URL('../artifacts/phase-4/', import.meta.url);
mkdirSync(artifacts,{recursive:true});
try {
  for (const width of [320,360,390,430,768,1366,2560]) {
    const page = await browser.newPage({viewport:{width,height:width>=1000?768:900}});
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await prepareUtilityPage(page);
    // No request to a real backend is permitted in this fixture suite.
    await page.route('https://**', route=>route.abort());
    const fits=async label=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${label} at ${width}`);
    await page.goto(new URL('settings/#navigationHeading',base).href);
    await page.locator('#settingsCategory').waitFor({state:'attached'});
    await page.waitForFunction(()=>document.querySelector('#settingsCategory').value==='navigationHeading');
    assert.equal(await page.locator('.settings-category-links a').count(),9);
    await fits('settings');
    if(width<=900) {
      await page.locator('#settingsCategory').selectOption('accountHeading');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'accountHeading');
      assert.equal(new URL(page.url()).hash,'#accountHeading');
      assert.ok(await page.locator('#settingsCategory').evaluate(el=>el.offsetHeight>=44));
    } else {
      await page.locator('.settings-category-links a[href="#automationHeading"]').click();
      assert.equal(new URL(page.url()).hash,'#automationHeading');
    }
    // All sections stay reachable, including a deep link to a legacy anchor.
    assert.equal(await page.locator('.settings-sections > section:visible').count(),9);
    await page.goto(new URL('crafting/',base).href);
    await page.waitForFunction(()=>document.querySelectorAll('.recipe-card').length>0);
    await page.waitForFunction(()=>document.querySelector('#craftingCategory').options.length===5);
    if(width<=900) {
      await page.locator('#craftingCategory').selectOption('specialists');
      await page.locator('.crafting-lock').waitFor();
      await page.locator('#craftingCategory').selectOption('secondary');
    } else {
      await page.locator('[data-crafting-group="pickaxes"]').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('[data-crafting-group="specialists"]').getAttribute('aria-selected'),'true');
      await page.locator('[data-crafting-group="secondary"]').click();
    }
    await page.locator('[data-subtabs="secondary"] [data-subcategory="lantern"]').focus();
    await page.keyboard.press('End');
    assert.equal(await page.locator('[data-subcategory="bag"]').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#craftingCategory').inputValue(),'secondary');
    await fits('crafting');
    if([390,1366].includes(width)) await page.screenshot({path:new URL(`crafting-${width}.png`,artifacts).pathname});
    await page.goto(new URL('inventory/',base).href);
    await page.locator('.gem-card').first().waitFor();
    assert.equal(await page.locator('#inventoryFilterSheet #sellAllButton').count(),0);
    const locked=page.locator('.gem-card').filter({has:page.getByRole('button',{name:'Unlock',exact:true})});
    // Locked gems retain their disabled sale/delete controls when visible.
    if(width<=720) await page.locator('#inventoryFilterToggle').click();
    await page.locator('#gemSort').selectOption('oldest');
    await page.locator('#gemFilter').selectOption('locked');
    await page.locator('#gemFilter').dispatchEvent('change');
    assert.equal(await locked.locator('[data-action="delete"]').isDisabled(),true);
    assert.equal(await locked.locator('[data-action="sell"]').isDisabled(),true);
    await page.locator('#gemFilter').selectOption('all');
    if(width<=720) await page.locator('#inventoryFilterClose').click();
    assert.equal(await page.locator('#sellAllButton').isVisible(),false);
    await page.locator('.inventory-cleanup summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#sellAllButton').isVisible(),true);
    // Existing confirmation remains mandatory; cancelling keeps all specimens.
    await page.locator('#sellAllButton').click();
    await page.locator('.dialog').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.gem-card').count()>0,true);
    if(width<=720) {
      await page.locator('#inventoryFilterToggle').click();
      await page.locator('#gemFilter').selectOption('locked');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'inventoryFilterToggle');
      await page.locator('#inventoryFilterToggle').click();
      await page.locator('#gemFilter').selectOption('all');
      await page.locator('#inventoryFilterClose').click();
    }
    await fits('inventory');
    await page.locator('#gemsTab').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#equipmentTab').getAttribute('aria-selected'),'true');
    await page.locator('#equipmentList [data-equipment-name]').first().waitFor();
    await page.locator('.equipment-loadout-panel summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#equipmentLoadouts .loadout-row:visible').count(),5);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#equipmentList [data-equipment-id]').count(),2);
    await fits('long equipment names');
    await page.locator('#equipmentStatus').selectOption('equipped');
    assert.equal(await page.locator('#equipmentList article:visible').count(),1);
    await page.locator('#equipmentSearch').fill('no matching item');
    assert.match(await page.locator('#equipmentResults').innerText(),/0 of 2/);
    await page.locator('#equipmentSearch').fill('');
    await page.locator('#equipmentStatus').selectOption('stored');
    assert.equal(await page.locator('#equipmentList article:visible').count(),1);
    await fits('equipment');
    if([390,1366].includes(width)) await page.screenshot({path:new URL(`inventory-${width}.png`,artifacts).pathname});
    await page.goto(new URL('auctions/',base).href);
    await page.locator('#sellTab').click();
    await page.locator('#sellGemList [data-gem]').first().waitFor();
    assert.equal(await page.locator('.sell-stage').count(),4);
    await page.locator('#sellGemList [data-gem="1"]').check();
    await page.locator('#sellGemList [data-gem="2"]').check();
    assert.match(await page.locator('#lotCount').innerText(),/2 items/);
    await page.locator('#sellPrice').fill('9999999999999999');
    assert.match(await page.locator('#sellValidation').innerText(),/outside/);
    assert.equal(await page.locator('#sellPrice').getAttribute('aria-invalid'),'true');
    await page.locator('#sellPrice').fill('20');
    await page.locator('#sellDuration').selectOption('6');
    assert.equal(await page.locator('#sellValidation').innerText(),'');
    const before = await page.evaluate(()=>window.__utilityActions.length);
    await page.locator('#listButton').click();
    await page.locator('.dialog').waitFor();
    assert.match(await page.locator('.dialog__body').innerText(),/Listing fee charged now/);
    await page.keyboard.press('Escape');
    assert.match(await page.locator('#lotCount').innerText(),/2 items/);
    assert.deepEqual(await page.evaluate(start=>window.__utilityActions.slice(start),before),[], 'review and cancellation never submit a listing');
    await fits('market');
    if([390,1366].includes(width)) await page.screenshot({path:new URL(`market-${width}.png`,artifacts).pathname});
    assert.deepEqual(errors,[],`page errors at ${width}`);
    await page.close();
  }
  console.log('PASS: Phase 4 utility layouts and keyboard/confirmation flows at 320/360/390/430/768/1366/2560px (fixture backend)');
} finally {await browser.close();}
