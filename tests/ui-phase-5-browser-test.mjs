import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { prepareUtilityPage } from './utility-page-fixtures.mjs';
const { chromium } = await import(process.env.NAVIGATION_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.NAVIGATION_PREVIEW_URL || 'http://127.0.0.1:5500/';
const browser = await chromium.launch({ headless: true });
mkdirSync(new URL('../artifacts/phase-5/', import.meta.url), { recursive: true });
try {
  for (const width of [320, 360, 390, 430, 768, 1366, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: width >= 1000 ? 768 : 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await prepareUtilityPage(page);
    await page.addInitScript(() => localStorage.setItem('gemIncremental.settings', JSON.stringify({globalCash:true})));
    await page.route('https://**', route => route.abort());
    await page.goto(new URL('inventory/', base).href);
    await page.locator('.gem-card').first().waitFor();
    const fits = async label => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label} ${width}`);
    const bounded = async locator => {
      const b = await locator.boundingBox();
      assert.ok(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= width + 1 && b.y + b.height <= (width >= 1000 ? 768 : 900) + 1, JSON.stringify(b));
    };
    await page.locator('#shellAccountButton').focus();
    await page.keyboard.press('ArrowDown');
    const account = page.locator('.menu').filter({ has: page.locator('[data-action="signout"]') });
    await account.waitFor(); await bounded(account);
    assert.ok(await account.evaluate(el => el.contains(document.activeElement)));
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'signout');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'shellAccountButton');
    assert.equal(await page.locator('#shellAccountButton').getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End'); await page.keyboard.press('Tab');
    assert.equal(await page.locator('#shellAccountButton').getAttribute('aria-expanded'), 'false');
    await page.locator('#shellAccountButton').click();
    await page.mouse.click(2, 450);
    assert.equal(await page.locator('#shellAccountButton').getAttribute('aria-expanded'), 'false');
    await page.evaluate(() => {
      document.querySelector('#shellWalletValue').textContent = '$999,999,999,999,999,999,999,999,999,999.99';
      document.querySelector('#shellAccountName').textContent = 'Very_long_username'.repeat(12);
    });
    await page.locator('#shellWallet').focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('#shellWallet').getAttribute('aria-expanded'), 'true');
    await fits('wallet'); await bounded(page.locator('#shellWallet'));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#shellWallet').getAttribute('aria-expanded'), 'false');
    // The announcement already exists, so mutate its text and let ResizeObserver
    // detect overflow without bypassing its actual disclosure implementation.
    await page.locator('.announce__body').first().evaluate(el => { el.textContent = 'Long announcement https://example.com/' + 'LongWord'.repeat(160); });
    const expand = page.locator('.announce__expand').first();
    await expand.waitFor({ state: 'visible' });
    await expand.click(); assert.equal(await expand.getAttribute('aria-expanded'), 'true');
    await fits('announcement'); await expand.click();
    // A confirmation over the real filter/navigation sheet owns Escape and Tab.
    if (width <= 780) await page.locator('#mobileNavigationTrigger').click();
    await page.evaluate(async () => {
      const { confirmDialog } = await import('/src/ui/dialog.js');
      window.__dialogResult = null;
      window.__dialogPromise = confirmDialog({ title: 'Delete fixture?', tone: 'danger', body: '<label>Reason <input id="dialogField"></label><button id="bodyButton">Inspect</button>' + '<p>Long content '.repeat(90) + '</p>' }).then(result => window.__dialogResult = result);
    });
    await bounded(page.locator('.dialog'));
    if ([390,1366].includes(width)) await page.screenshot({path:new URL(`../artifacts/phase-5/confirmation-${width}.png`,import.meta.url).pathname});
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'cancel');
    await page.locator('#bodyButton').evaluate(el => el.click());
    assert.equal(await page.locator('.dialog').count(), 1);
    await page.locator('.dialog [data-action="confirm"]').focus(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'dialogField');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'confirm');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__dialogResult), 'cancel');
    if (width <= 780) {
      assert.equal(await page.locator('#mobileNavigationTrigger').getAttribute('aria-expanded'), 'true');
      assert.ok(await page.locator('#mobileNavigationSheet').evaluate(el => el.contains(document.activeElement)));
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'mobileNavigationTrigger');
    }
    // Backdrop cancellation and non-dismissible processing surfaces.
    await page.evaluate(async () => {
      const {confirmDialog} = await import('/src/ui/dialog.js');
      confirmDialog({title:'Review fixture',body:'Review only'}).then(result => window.__backdropResult=result);
    });
    await page.locator('.dialog-overlay').click({ position: {x:2,y:2} });
    assert.equal(await page.evaluate(()=>window.__backdropResult),'cancel');
    await page.evaluate(async () => {
      const {confirmDialog} = await import('/src/ui/dialog.js');
      confirmDialog({title:'Processing fixture',dismissible:false,preventEnter:true});
    });
    await page.keyboard.press('Escape');
    await page.locator('.dialog-overlay').click({ position: {x:2,y:2} });
    assert.equal(await page.locator('.dialog').count(),1);
    await page.locator('.dialog [data-action="confirm"]').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.dialog').count(),1);
    await page.locator('.dialog [data-action="cancel"]').click();
    if (width <= 780) {
      await page.locator('#mobileNavigationTrigger').click();
      await page.keyboard.press('Control+k');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'quickNavSearch');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#mobileNavigationTrigger').getAttribute('aria-expanded'),'true');
      // The real cutscene controller must retain priority over sheet focus.
      await page.evaluate(async()=>{
        const {cutsceneController}=await import('/src/ui/cutsceneController.js');
        cutsceneController.play({duration:60000,fadeOutMs:0,render:()=>{
          const overlay=document.createElement('div'); overlay.id='phase5Cinematic';
          overlay.style.cssText='position:fixed;inset:0;z-index:2147483000;background:black';
          document.body.append(overlay); return overlay;
        }});
      });
      await page.waitForFunction(()=>document.activeElement.classList.contains('cutscene-controls__skip'));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#phase5Cinematic').count(),0);
      assert.equal(await page.locator('#mobileNavigationTrigger').getAttribute('aria-expanded'),'true');
      await page.keyboard.press('Escape');
    } else {
      await page.locator('#shellThemeButton').focus();
      assert.equal(await page.locator('[role="tooltip"]').count(),1);
      await page.keyboard.press('ArrowDown');
      const light=page.locator('.menu [data-mode="light"]');
      await light.focus(); await page.keyboard.press('Space');
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.mode),'light');
      assert.equal(await page.locator('.menu [data-mode="light"]').getAttribute('aria-pressed'),'true');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'shellThemeButton');
    }
    // Position a real popover against bottom/right edges with oversized content.
    await page.evaluate(async () => {
      const { mountPopover } = await import('/src/ui/popover.js');
      const button = document.createElement('button'); button.id = 'edgeTrigger'; button.textContent = 'Edge menu';
      button.style.cssText = 'position:fixed;bottom:5px;right:5px;z-index:1400';
      const panel = document.createElement('div'); panel.className = 'menu'; panel.id = 'edgeMenu'; panel.hidden = true;
      panel.innerHTML = '<button class="menu__item">Long menu item</button>'.repeat(40);
      document.body.append(button);
      const menu = mountPopover({ button, panel }); button.onclick = () => menu.toggle();
    });
    await page.locator('#edgeTrigger').click(); await bounded(page.locator('#edgeMenu'));
    assert.ok(await page.locator('#edgeMenu').evaluate(el => el.scrollHeight > el.clientHeight));
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'edgeTrigger');
    await page.locator('#edgeTrigger').evaluate(el => el.remove());
    await page.evaluate(() => document.documentElement.style.setProperty('--safe-area-bottom','24px'));
    await page.evaluate(async () => {
      const { toast } = await import('/src/ui/toast.js');
      for (let i=0; i<5; i++) toast('Fixture notification '+i, {duration:60000});
    });
    assert.equal(await page.locator('.toast').count(), 3);
    await page.locator('.toast__dismiss').first().focus(); await page.keyboard.press('Enter');
    await page.waitForTimeout(450); assert.equal(await page.locator('.toast').count(), 2);
    if (width <= 780) {
      // Simulate an open chat surface; no live messages/transactions are sent.
      await page.locator('#chatDock').evaluate(el => el.classList.remove('hidden'));
      const toastBox = await page.locator('.toast-region').boundingBox();
      const chatBox = await page.locator('#chatDock').boundingBox();
      assert.ok(toastBox.y + toastBox.height <= chatBox.y || toastBox.x + toastBox.width <= chatBox.x, 'chat/toast clearance');
      await page.locator('#chatDock').evaluate(el => el.classList.add('hidden'));
      await page.locator('#mobileNavigationTrigger').click();
      const layer = await page.evaluate(() => ({ sheet: +getComputedStyle(document.querySelector('#mobileNavigationSheet')).zIndex, toast: +getComputedStyle(document.querySelector('.toast-region')).zIndex }));
      assert.ok(layer.sheet > layer.toast);
      await page.keyboard.press('Escape');
    }
    if (width < 681) {
      await page.locator('.global-cash__trigger').click();
      assert.equal(await page.locator('.global-cash__panel').getAttribute('aria-modal'), 'true');
      await page.keyboard.press('Escape');
      assert.ok(await page.locator('.global-cash__trigger').evaluate(el => el === document.activeElement));
    }
    await page.evaluate(() => { document.querySelector('.toast-region')?.remove(); document.documentElement.style.fontSize = '24px'; document.documentElement.style.setProperty('--safe-area-bottom','24px'); });
    await page.locator('#shellAccountButton').click(); await bounded(account); await fits('150% text');
    if ([390,1366].includes(width)) await page.screenshot({path:new URL(`../artifacts/phase-5/interaction-${width}.png`,import.meta.url).pathname});
    assert.deepEqual(errors, [], `page errors ${width}`);
    await page.close();
  }
  console.log('PASS: Phase 5 shared interactions at 320/360/390/430/768/1366/1920px, keyboard, reduced motion, 150% text and safe-area fixtures');
} finally { await browser.close(); }
