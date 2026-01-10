#!/usr/bin/env node
/*
Generic Playwright autofill script
- Reads personas from `templates/personas/flight_personas.json`
- Accepts a `--url` and `--persona=<id|index|all>` argument
- Attempts to heuristically fill common form fields (name, email, phone, passport, dob, address, etc.)
- Saves a screenshot and page HTML for review in `outputs/<persona>`
- Does NOT click final purchase button unless `--autoclick` is provided

Usage examples:
  node scripts/autofill_playwright.js --url="https://example.com/checkout" --persona=pax-001
  node scripts/autofill_playwright.js --url="https://example.com/checkout" --persona=all --headless=true
  node scripts/autofill_playwright.js --url="https://example.com/checkout" --persona=2 --autoclick

Requirements:
  npm install playwright
  npx playwright install

This file is standalone and does not modify other project files.
*/

const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium, firefox, webkit } = require('playwright');

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [k, v] = arg.slice(2).split('=');
    args[k] = v === undefined ? true : v;
  });
  return args;
}

async function tryFill(page, selectors, value) {
  if (!value) return false;
  for (const sel of selectors) {
    try {
      const locator = page.locator(sel).first();
      if (await locator.count()) {
        const visible = await locator.isVisible().catch(() => false);
        const disabled = await locator.isDisabled().catch(() => false);
        if (visible && !disabled) {
          await locator.fill(String(value));
          return true;
        }
      }
    } catch (e) {
      // ignore
    }
  }
  return false;
}

async function trySelect(page, selectors, value) {
  if (!value) return false;
  for (const sel of selectors) {
    try {
      const locator = page.locator(sel).first();
      if (await locator.count()) {
        const visible = await locator.isVisible().catch(() => false);
        const disabled = await locator.isDisabled().catch(() => false);
        if (visible && !disabled) {
          try {
            await locator.selectOption({ label: String(value) });
            return true;
          } catch (e) {
            try {
              await locator.selectOption(String(value));
              return true;
            } catch (e2) {
              await locator.fill(String(value));
              return true;
            }
          }
        }
      }
    } catch (e) {}
  }
  return false;
}

function buildSelectorsForKey(name) {
  const n = name.toLowerCase();
  const patterns = [
    `input[name*="${n}"]`,
    `input[id*="${n}"]`,
    `input[placeholder*="${n}"]`,
    `textarea[name*="${n}"]`,
    `select[name*="${n}"]`,
    `select[id*="${n}"]`,
    `input[data-test*="${n}"]`,
    `input[aria-label*="${n}"]`,
    `input[class*="${n}"]`,
    `input[title*="${n}"]`,
  ];
  return patterns;
}

async function fillCommonFields(page, persona) {
  const mapping = [
    { keys: ['first', 'given', 'given-name', 'givenname', 'firstname'], value: persona.firstName },
    { keys: ['last', 'family', 'family-name', 'familyname', 'lastname'], value: persona.lastName },
    { keys: ['name', 'fullname', 'full-name', 'contact'], value: persona.fullName },
    { keys: ['email', 'emailaddress', 'e-mail'], value: persona.email },
    { keys: ['phone', 'telephone', 'tel', 'phonenumber'], value: persona.phone },
    { keys: ['passport', 'passportnumber', 'passport_no'], value: persona.passport?.number || '' },
    { keys: ['dob', 'dateofbirth', 'birthdate', 'date-of-birth'], value: persona.dateOfBirth },
    { keys: ['address', 'street', 'addr', 'billing-address'], value: persona.billing?.billingAddress || '' },
    { keys: ['city', 'town'], value: '' },
    { keys: ['postal', 'postcode', 'zip'], value: '' },
    { keys: ['country', 'nationality'], value: persona.nationality || '' },
  ];

  for (const m of mapping) {
    let done = false;
    for (const key of m.keys) {
      const selectors = buildSelectorsForKey(key);
      done = await tryFill(page, selectors, m.value || '');
      if (done) break;
    }
    if (!done) {
      // try label match
      try {
        const label = await page.getByText(new RegExp(m.keys[0], 'i')).first();
        if (await label.count()) {
          const forAttr = await label.getAttribute('for');
          if (forAttr) {
            const sel = `#${forAttr}`;
            await tryFill(page, [sel], m.value || '');
          }
        }
      } catch (e) {}
    }
  }

  // try selects for country/nationality
  await trySelect(page, ['select[name*="country"]', 'select[id*="country"]', 'select[name*="nationality"]'], persona.nationality || '');

  // try gender
  await trySelect(page, ['select[name*="gender"]', 'select[id*="gender"]'], persona.gender || '');

  // seat and meal
  await trySelect(page, ['select[name*="seat"]', 'select[id*="seat"]', 'select[name*="seatPreference"]'], persona.seatPreference || '');
  await trySelect(page, ['select[name*="meal"]', 'select[id*="meal"]', 'select[name*="mealPreference"]'], persona.mealPreference || '');
}

async function runForPersona(browserType, url, persona, opts) {
  const browser = await browserType.launch({ headless: !!opts.headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`[${persona.id}] Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts.timeout });
  await page.waitForTimeout(opts.waitBeforeFill);

  await fillCommonFields(page, persona);

  // wait a moment for any dynamic validation
  await page.waitForTimeout(1000);

  // try to find a buy/pay/continue button
  const button = page.getByRole('button', { name: /buy|pay|confirm|purchase|continue|next|book/i }).first();
  const outputsDir = path.join(process.cwd(), 'outputs', persona.id);
  fs.mkdirSync(outputsDir, { recursive: true });

  // save screenshot and HTML
  const screenshotPath = path.join(outputsDir, `filled_${Date.now()}.png`);
  const htmlPath = path.join(outputsDir, `filled_${Date.now()}.html`);
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (e) {
    console.warn('screenshot failed', e.message);
  }
  try {
    const html = await page.content();
    fs.writeFileSync(htmlPath, html, 'utf8');
  } catch (e) {
    console.warn('save html failed', e.message);
  }

  console.log(`[${persona.id}] Saved screenshot -> ${screenshotPath}`);
  console.log(`[${persona.id}] Saved html -> ${htmlPath}`);

  if (await button.count()) {
    const text = (await button.innerText()).trim();
    console.log(`[${persona.id}] Found button: ${text}`);
    if (opts.autoclick) {
      console.log(`[${persona.id}] Auto-click enabled: clicking button.`);
      try {
        await button.click();
        await page.waitForTimeout(2000);
      } catch (e) {
        console.warn(`[${persona.id}] Auto-click failed:`, e.message);
      }
    } else {
      console.log(`[${persona.id}] Auto-click disabled. Please complete the purchase manually in the opened browser window.`);
    }
  } else {
    console.log(`[${persona.id}] Could not find a buy/pay/continue button automatically.`);
  }

  // keep browser open unless headless
  if (opts.headless) {
    await browser.close();
  } else {
    console.log(`[${persona.id}] Leaving browser open for review. Close it when done.`);
  }
}

(async function main() {
  const args = parseArgs();
  const targetUrl = args.url || args.u;
  if (!targetUrl) {
    console.error('Error: --url is required');
    process.exit(1);
  }
  const personaArg = args.persona || args.p || 'pax-001';
  const browserName = args.browser || 'chromium';
  const headless = args.headless === 'true' || args.headless === true ? true : false;
  const autoclick = !!args.autoclick;
  const timeout = Number(args.timeout || 30000);
  const waitBeforeFill = Number(args.wait || 2000);

  const personasPath = path.join(process.cwd(), 'templates', 'personas', 'flight_personas.json');
  if (!fs.existsSync(personasPath)) {
    console.error('Personas file not found at', personasPath);
    process.exit(1);
  }
  const personas = JSON.parse(fs.readFileSync(personasPath, 'utf8'));

  let targets = [];
  if (personaArg === 'all') {
    targets = personas;
  } else {
    const byId = personas.find((p) => p.id === personaArg);
    if (byId) targets = [byId];
    else {
      const idx = Number(personaArg);
      if (!Number.isNaN(idx) && personas[idx]) targets = [personas[idx]];
      else targets = [personas[0]];
    }
  }

  const browserType = browserName === 'firefox' ? firefox : browserName === 'webkit' ? webkit : chromium;

  for (const persona of targets) {
    try {
      await runForPersona(browserType, targetUrl, persona, { headless, autoclick, timeout, waitBeforeFill });
    } catch (e) {
      console.error(`Error for persona ${persona.id}:`, e.stack || e.message || e);
    }
  }

  console.log('All done.');
})();
