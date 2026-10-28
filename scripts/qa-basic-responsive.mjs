// Regression: /basic shell + bottom nav must span the viewport at every width
// (no phone-mockup cap), and /basic-v2 must keep its 430px experiment shell.
//
// Usage: npm run dev (port 18010) in one terminal, then
//   node scripts/qa-basic-responsive.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:18010';
const WIDTHS = [320, 375, 390, 430, 768, 1440];
const HEIGHT = 844;
const TOL = 1; // px, sub-pixel rounding
const NAV_INSET = 14;

// Routes that render the bottom nav (booking flow hides it).
const NAV_ROUTES = [
  '/basic', '/basic/more', '/basic/qualify', '/basic/orders',
  '/basic/orders/GGX-240601-001', '/basic/earnings', '/basic/account',
  '/basic/address-book', '/basic/bulk', '/basic/store', '/basic/inventory',
  '/basic/support', '/basic/settings', '/basic/same-day', '/basic/business-preview',
];
const NO_NAV_ROUTES = ['/basic/deliver'];

const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  FAIL ${msg}`); };
const near = (a, b) => Math.abs(a - b) <= TOL;

async function shellBox(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width };
  }, selector);
}

async function checkPanel(page, selector, expectedWidth, label) {
  const panel = page.locator(selector);
  await panel.waitFor({ state: 'visible' });
  const box = await panel.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !near(box.width, expectedWidth) || !near(box.x, (viewport.width - expectedWidth) / 2)) {
    fail(`${label}: panel is not aligned with its shell: ${JSON.stringify(box)}`);
  }
  if (await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1)) {
    fail(`${label}: panel content overflows horizontally`);
  }
}

async function checkBookingPanels(page, width, v2 = false) {
  const path = v2 ? '/basic-v2/delivery' : '/basic/deliver';
  const panelWidth = v2 ? Math.min(width, 430) : width;
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Max Rodriguez/ }).click();
  await checkPanel(page, '.fixed.inset-0.z-50 > .relative', panelWidth, `${width} ${path} sender sheet`);
  await page.getByRole('button', { name: /Acme Warehouse/ }).click();
  await page.getByRole('button', { name: 'Add recipient address' }).click();
  await page.getByRole('button', { name: 'Pick from Address Book' }).click();
  await checkPanel(page, '.fixed.inset-0.z-50 > .relative', panelWidth, `${width} ${path} receiver sheet`);
  await page.getByRole('button', { name: /Max Rodriguez/ }).click();
  await page.getByRole('button', { name: 'Save Receiver' }).click();
  await page.getByPlaceholder('Enter item name').fill('Responsive layout check');
  await checkPanel(page, '.fixed.z-50.w-full', panelWidth, `${width} ${path} item drawer`);
  await page.getByRole('button', { name: 'Save Item Details' }).click();
  await page.waitForURL(`**${path}/booking`);
  if (!v2) {
    await checkPanel(page, '.fixed.z-30.w-full', width, `${width} booking payment bar`);
    await checkOverflow(page, `${width} booking review`);
  }
}

async function checkOverflow(page, label) {
  const o = await page.evaluate(() => {
    const main = document.querySelector('[data-shell="basic"] main');
    return {
      docScroll: document.documentElement.scrollWidth,
      vw: window.innerWidth,
      mainScroll: main ? main.scrollWidth : 0,
      mainClient: main ? main.clientWidth : 0,
    };
  });
  if (o.docScroll > o.vw + TOL) fail(`${label}: document overflows (${o.docScroll} > ${o.vw})`);
  if (o.mainScroll > o.mainClient + TOL) fail(`${label}: <main> content overflows (${o.mainScroll} > ${o.mainClient})`);
}

// Dashboard tiles must sit inside their row and the glass card (root/main checks
// miss this: the card clips nothing, so overflow only shows as tile bounds).
async function checkDashboardTiles(page, label) {
  const r = await page.evaluate(() => {
    const links = [...document.querySelectorAll('[data-shell="basic"] main a')]
      .filter((a) => ['Shopify', 'Storefront', 'Rewards', 'Referrals', 'Analytics'].includes(a.textContent.trim()));
    if (links.length !== 5) return { count: links.length };
    const row = links[0].parentElement;
    const card = row.parentElement;
    const rb = row.getBoundingClientRect();
    const cb = card.getBoundingClientRect();
    const cs = getComputedStyle(card);
    const innerL = cb.left + parseFloat(cs.paddingLeft);
    const innerR = cb.right - parseFloat(cs.paddingRight);
    const items = links.map((a) => {
      const b = a.getBoundingClientRect();
      const kids = [...a.querySelectorAll('img, span')].map((k) => k.getBoundingClientRect());
      return { name: a.textContent.trim(), left: b.left, right: b.right, kids: kids.map((k) => [k.left, k.right]) };
    });
    const tiles = [...document.querySelectorAll('[data-shell="basic"] main button')]
      .filter((b) => b.querySelector(':scope > div > img'))
      .map((b) => {
        const box = b.querySelector(':scope > div').getBoundingClientRect();
        const img = b.querySelector('img').getBoundingClientRect();
        return { name: b.textContent.trim(), boxL: box.left, boxR: box.right, imgL: img.left, imgR: img.right };
      });
    return {
      count: links.length,
      row: { scroll: row.scrollWidth, client: row.clientWidth, left: rb.left, right: rb.right },
      inner: { left: innerL, right: innerR },
      items,
      tiles,
    };
  });
  if (r.count !== 5) return fail(`${label}: expected 5 dashboard shortcuts, found ${r.count}`);
  if (r.row.scroll > r.row.client + TOL) fail(`${label}: shortcut row overflows (${r.row.scroll} > ${r.row.client})`);
  for (const it of r.items) {
    if (it.left < r.inner.left - TOL || it.right > r.inner.right + TOL) {
      fail(`${label}: shortcut ${it.name} ${it.left}..${it.right} outside card content ${r.inner.left}..${r.inner.right}`);
    }
    for (const [l, rt] of it.kids) {
      if (l < it.left - TOL || rt > it.right + TOL) fail(`${label}: shortcut ${it.name} content ${l}..${rt} spills its tile ${it.left}..${it.right}`);
    }
  }
  for (const t of r.tiles) {
    if (t.imgL < t.boxL - TOL || t.imgR > t.boxR + TOL) fail(`${label}: primary tile ${t.name.replace(/\s+/g, ' ')} image ${t.imgL}..${t.imgR} exceeds box ${t.boxL}..${t.boxR}`);
  }
}

const browser = await chromium.launch({ headless: true });

for (const width of WIDTHS) {
  console.log(`\n== ${width}px ==`);
  const ctx = await browser.newContext({ viewport: { width, height: HEIGHT } });
  const page = await ctx.newPage();

  for (const route of [...NAV_ROUTES, ...NO_NAV_ROUTES]) {
    const label = `${width} ${route}`;
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-shell="basic"]');

    const shell = await shellBox(page, '[data-shell="basic"]');
    if (!near(shell.left, 0) || !near(shell.width, width)) {
      fail(`${label}: shell ${shell.left}..${shell.right} (w=${shell.width}), expected 0..${width}`);
    }

    const nav = await shellBox(page, '[data-shell="basic"] nav');
    if (NO_NAV_ROUTES.includes(route)) {
      if (nav) fail(`${label}: nav should be hidden in booking flow`);
    } else if (!nav) {
      fail(`${label}: bottom nav missing`);
    } else if (!near(nav.left, NAV_INSET) || !near(nav.right, width - NAV_INSET)) {
      fail(`${label}: nav ${nav.left}..${nav.right}, expected ${NAV_INSET}..${width - NAV_INSET}`);
    }

    await checkOverflow(page, label);
    if (route === '/basic') await checkDashboardTiles(page, label);
  }

  // Bottom-nav navigation: each tab keeps the shell + nav bounds.
  await page.goto(BASE + '/basic', { waitUntil: 'networkidle' });
  for (const [name, path] of [['Rewards', '/basic/more'], ['Transactions', '/basic/orders'], ['Earnings', '/basic/earnings'], ['Home', '/basic']]) {
    await page.locator('[data-shell="basic"] nav').getByText(name, { exact: true }).click();
    await page.waitForURL((u) => u.pathname.replace(/\/$/, '') === path);
    const label = `${width} nav->${name}`;
    const shell = await shellBox(page, '[data-shell="basic"]');
    const nav = await shellBox(page, '[data-shell="basic"] nav');
    if (!near(shell.width, width)) fail(`${label}: shell width ${shell.width} != ${width}`);
    if (!nav || !near(nav.left, NAV_INSET) || !near(nav.right, width - NAV_INSET)) {
      fail(`${label}: nav bounds ${nav && `${nav.left}..${nav.right}`}`);
    }
    await checkOverflow(page, label);
  }

  // Book Now FAB opens the booking flow, which hides the nav.
  await page.locator('[data-shell="basic"] nav a[aria-label="Book Now"]').click();
  await page.waitForURL('**/basic/deliver');
  await page.locator('[data-shell="basic"] nav').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  if (await shellBox(page, '[data-shell="basic"] nav')) fail(`${width} Book Now: nav still visible`);

  // Account sheet (Home header) spans the viewport width in /basic.
  await page.goto(BASE + '/basic', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Account' }).click();
  const sheet = await page.evaluate(() => {
    const el = document.querySelector('.fixed.inset-0.z-50 .absolute.bottom-0');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right };
  });
  if (!sheet) fail(`${width} account sheet: not found`);
  else if (!near(sheet.left, 0) || !near(sheet.right, width)) {
    fail(`${width} account sheet: ${sheet.left}..${sheet.right}, expected 0..${width}`);
  }

  // Basic-v2 experiment keeps its phone-width cap (shared sheet/booking bar included).
  await page.goto(BASE + '/basic-v2', { waitUntil: 'networkidle' });
  const v2 = await page.evaluate(() => {
    const el = document.querySelector('.min-h-screen > .relative.mx-auto');
    return el ? el.getBoundingClientRect().width : null;
  });
  const expectedV2 = Math.min(width, 430);
  if (v2 === null || !near(v2, expectedV2)) fail(`${width} /basic-v2 shell width ${v2}, expected ${expectedV2}`);

  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await checkPanel(page, '.fixed.inset-0.z-50 .absolute.bottom-0', expectedV2, `${width} v2 account sheet`);
  await checkBookingPanels(page, width);
  await checkBookingPanels(page, width, true);

  await ctx.close();
}

await browser.close();

if (failures.length) {
  console.log(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nAll Basic responsive checks passed');
