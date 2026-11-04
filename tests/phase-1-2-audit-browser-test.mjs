import { prepareUtilityPage } from './utility-page-fixtures.mjs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.NAVIGATION_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true});
const base = process.env.NAVIGATION_PREVIEW_URL || 'http://127.0.0.1:5500/';
try {
  for (const width of [360,390,430,768,1366,2560]) {
    const page = await browser.newPage({viewport:{width,height:width<1000?900:768}});
    await prepareUtilityPage(page);
    await page.goto(new URL("inventory/", base).href);
    await page.locator('.topbar').waitFor();
    await page.evaluate(() => {
      document.querySelector('#shellAccountName').textContent = 'Extremely_long_player_name_'.repeat(5);
      document.querySelector('#shellWalletValue').textContent = '$999,999,999,999,999,999';
      document.querySelector('#shellWallet').classList.add('wallet--expanded');
      const announcement = document.createElement('div');
      announcement.className='announce-bar';
      announcement.innerHTML='<div class="announce"><span class="announce__body">'+ 'Long announcement with many enabled destinations. '.repeat(30)+'</span></div>';
      document.querySelector('main').before(announcement);
      window.dispatchEvent(new Event('resize'));
    });
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`shell stress ${width}`);
    if(width<=780) {
      await page.locator('#mobileNavigationTrigger').click();
      await page.locator('#mobileNavigationSearch').fill('gem index');
      const visible = page.locator('[data-mobile-navigation-row]:not([hidden])').last();
      // Hidden search results must never be included in the sheet's focus loop.
      await visible.focus();
      await page.keyboard.press('Tab');
      assert.ok(await page.locator('#mobileNavigationSheet').evaluate(el=>el.contains(document.activeElement)));
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'mobileNavigationTrigger');
    }
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await prepareUtilityPage(page);
    await page.goto(new URL("inventory/", base).href);
  await page.evaluate(async()=>{
    const {mountMobileSheet}=await import('/src/ui/mobileSheet.js');
    const host=document.createElement('div');
    host.innerHTML='<button id="auditTrigger">Filters</button><div id="auditBackdrop" hidden></div><div id="auditSheet"><button id="auditClose">Close</button><button id="auditLast">Last visible</button><div hidden><button id="auditHidden">Hidden</button></div></div>';
    document.body.append(host);
    mountMobileSheet({sheet:document.querySelector('#auditSheet'),trigger:document.querySelector('#auditTrigger'),closeButton:document.querySelector('#auditClose'),backdrop:document.querySelector('#auditBackdrop'),modalOnly:true});
  });
  await page.locator('#auditTrigger').click();
  await page.locator('#auditLast').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'auditClose');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'auditLast');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'auditTrigger');
  await page.close();
  console.log('PASS: Phase 1–2 audit stress and hidden-ancestor keyboard focus at 360/390/430/768/1366/2560px');
} finally {await browser.close();}
