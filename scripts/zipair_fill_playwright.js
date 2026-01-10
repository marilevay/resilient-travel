#!/usr/bin/env node
// Standalone Playwright autofill script for Zipair booking pages.
// Usage:
//   node scripts/zipair_fill_playwright.js --persona=pax-001 --url="https://..." [--autoclick]
// Requirements: install Playwright and optionally run `npx playwright install`.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    const [k, v] = arg.split('=');
    if (k.startsWith('--')) {
      const key = k.slice(2);
      args[key] = v === undefined ? true : v;
    }
  });
  return args;
}

async function tryFill(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const locator = page.locator(sel).first();
      if (await locator.count()) {
        // check visible/enabled
        const visible = await locator.isVisible().catch(() => false);
        const disabled = await locator.isDisabled().catch(() => false);
        if (visible && !disabled) {
          await locator.fill(String(value));
          console.log(`Filled ${sel} -> ${value}`);
          return true;
        }
      }
    } catch (e) {
      // ignore and continue
    }
  }
  return false;
}

async function trySelect(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const locator = page.locator(sel).first();
      if (await locator.count()) {
        const visible = await locator.isVisible().catch(() => false);
        const disabled = await locator.isDisabled().catch(() => false);
        if (visible && !disabled) {
          // try selecting by value then by label/text
          try {
            await locator.selectOption({ label: String(value) });
            console.log(`Selected ${sel} -> ${value}`);
            return true;
          } catch (e) {
            try {
              await locator.selectOption(String(value));
              console.log(`Selected ${sel} -> ${value}`);
              return true;
            } catch (e2) {
              // fallback to typing
              await locator.fill(String(value));
              console.log(`Typed into ${sel} -> ${value}`);
              return true;
            }
          }
        }
      }
    } catch (e) {}
  }
  return false;
}

(async function main() {
  const args = parseArgs();
  const personaId = args.persona || args.p || null;
  const targetUrl = args.url || args.u || 'https://www.zipair.net/en/booking/class/outbound?from_metasearch=yes';
  const autoClick = !!args.autoclick;

  const personasPath = path.join(process.cwd(), 'templates', 'personas', 'flight_personas.json');
  if (!fs.existsSync(personasPath)) {
    console.error('Personas file not found at', personasPath);
    process.exit(1);
  }

  const personas = JSON.parse(fs.readFileSync(personasPath, 'utf8'));
  let persona = null;
  if (personaId) {
    persona = personas.find((p) => p.id === personaId) || null;
    if (!persona) {
      // try numeric index
      const idx = Number(personaId);
      if (!Number.isNaN(idx) && personas[idx]) persona = personas[idx];
    }
  }
  if (!persona) persona = personas[0];
  console.log('Using persona:', persona.id, persona.fullName);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to', targetUrl);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

  // wait a bit for dynamic content
  await page.waitForTimeout(2000);

  // Generic fill strategy: try many common selectors for each field
  const mapping = [
    { keys: ['firstName', 'first_name', 'givenName', 'given-name', 'givenname'], value: persona.firstName },
    { keys: ['lastName', 'last_name', 'familyName', 'family-name', 'familyname'], value: persona.lastName },
    { keys: ['fullName', 'contactName', 'name'], value: persona.fullName },
    { keys: ['email', 'emailAddress', 'email-address'], value: persona.email },
    { keys: ['phone', 'telephone', 'tel', 'phoneNumber', 'phone-number'], value: persona.phone },
    { keys: ['passport.number', 'passportNumber', 'passport', 'passport-number'], value: persona.passport?.number || '' },
    { keys: ['passport_country', 'passportCountry', 'passport-country', 'country-of-issuance'], value: persona.passport?.country || persona.nationality || '' },
    { keys: ['dob', 'date_of_birth', 'birthdate', 'date-of-birth'], value: persona.dateOfBirth },
  ];

  // Helper to build selectors from potential key names
  function buildSelectors(name) {
    const selectors = [];
    // try typical attributes
    const patterns = [
      `input[name*="${name}"]`,
      `input[id*="${name}"]`,
      `input[placeholder*="${name}"]`,
      `textarea[name*="${name}"]`,
      `select[name*="${name}"]`,
      `select[id*="${name}"]`,
      `input[data-test*="${name}"]`,
      `input[aria-label*="${name}"]`,
      `input[class*="${name}"]`,
    ];
    return patterns;
  }

  // Fill fields
  for (const m of mapping) {
    const tried = [];
    let filled = false;
    for (const key of m.keys) {
      const selectors = buildSelectors(key.toLowerCase());
      tried.push(...selectors);
      filled = await tryFill(page, selectors, m.value || '');
      if (filled) break;
    }
    if (!filled) {
      // try visible label matching
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

  // nationality / country selects
  await trySelect(page, ['select[name*="national" ]', 'select[name*="country"]', 'select[id*="country"]', 'select[name*="nationality"]'], persona.nationality || '');

  // gender
  await trySelect(page, ['select[name*="gender"]', 'select[id*="gender"]'], persona.gender || '');

  // seat and meal preferences (attempt)
  await trySelect(page, ['select[name*="seat"]', 'select[name*="seatPreference"]'], persona.seatPreference || '');
  await trySelect(page, ['select[name*="meal"]', 'select[name*="mealPreference"]'], persona.mealPreference || '');

  console.log('Attempted auto-fill. You may need to review fields in the opened browser window.');

  // find a likely "Buy/Pay/Continue/Confirm" button but do NOT press it unless --autoclick provided
  const button = page.getByRole('button', { name: /buy|pay|confirm|purchase|continue|next/i }).first();
  if (await button.count()) {
    const text = (await button.innerText()).trim();
    console.log('Found button:', text);
    if (autoClick) {
      console.log('Auto-click enabled: clicking the button now.');
      await button.click();
      console.log('Clicked buy button. Waiting a few seconds for navigation...');
      await page.waitForTimeout(3000);
    } else {
      console.log('Auto-click disabled. Please review the page and press the buy button manually in the browser.');
    }
  } else {
    console.log('Could not locate a buy/pay/continue button automatically. Please press the appropriate button in the browser when ready.');
  }

  console.log('Script finished — leaving browser open for you to review/complete the purchase.');
  // keep the process alive so user can click — exit on Ctrl+C
})();
