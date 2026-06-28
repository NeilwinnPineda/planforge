/**
 * Verification observation script — runs N layouts and reports verification results.
 * Usage: node scripts/observe-verification.mjs [runs=5]
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Neilwinn Pineda/AppData/Local/Temp/pw-temp/node_modules/playwright');

const RUNS = parseInt(process.argv[2] ?? '5');
const APP_URL = 'http://localhost:4300';
const POLL_MS = 4000;
const TIMEOUT_MS = 180000;

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});

const page = await browser.newPage();
page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

const results = [];
console.log(`Observing verification across ${RUNS} runs...\n`);

for (let i = 0; i < RUNS; i++) {
  process.stdout.write(`Run ${i + 1}/${RUNS}: simulating...`);

  if (i === 0) {
    await page.goto(`${APP_URL}/simulation`, { waitUntil: 'networkidle', timeout: 20000 });
  } else {
    try { await page.click('a[href="/simulation"]'); } catch {
      await page.goto(`${APP_URL}/simulation`, { waitUntil: 'networkidle', timeout: 20000 });
    }
  }

  // Wait for a capture
  const deadline = Date.now() + TIMEOUT_MS;
  let captured = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(POLL_MS);
    const captures = await page.evaluate(() =>
      parseInt(document.body.innerText.match(/(\d+) captures?/i)?.[1] ?? '0')
    );
    process.stdout.write('.');
    if (captures > 0) { captured = true; break; }
  }

  if (!captured) { console.log(' TIMEOUT'); continue; }

  // Navigate to verification via SPA click (preserves Angular in-memory state)
  process.stdout.write(' → verification...');
  try {
    await page.click('a[href="/verification"]');
  } catch {
    await page.goto(`${APP_URL}/verification`, { waitUntil: 'networkidle', timeout: 15000 });
  }
  await page.waitForTimeout(2000);

  const text = await page.evaluate(() => document.body.innerText);

  if (text.includes('No captured layout')) {
    console.log(' NO LAYOUT');
    continue;
  }

  // Parse verdict
  const accepted = text.includes('ACCEPTED');
  const verdict = accepted ? 'ACCEPTED' : 'CULLED';

  // Parse check results from page text
  const checks = {
    deficiency:     { pass: /Deficiency[\s\S]{0,50}PASS/.test(text),      fail: /Deficiency[\s\S]{0,50}FAIL/.test(text) },
    aspectRatio:    { pass: /Aspect Ratio[\s\S]{0,50}PASS/.test(text),    fail: /Aspect Ratio[\s\S]{0,50}FAIL/.test(text) },
    access:         { pass: /\bAccess[\s\S]{0,50}PASS/.test(text),        fail: /\bAccess[\s\S]{0,50}FAIL/.test(text) },
    criticalTouch:  { pass: /Critical Touch[\s\S]{0,50}PASS/.test(text),  fail: /Critical Touch[\s\S]{0,50}FAIL/.test(text) },
    garageFrontage: { pass: /Garage Frontage[\s\S]{0,50}PASS/.test(text), fail: /Garage Frontage[\s\S]{0,50}FAIL/.test(text) },
    slivers:        { pass: /Slivers[\s\S]{0,50}PASS/.test(text),         fail: /Slivers[\s\S]{0,50}FAIL/.test(text) },
    overlaps:       { pass: /Overlaps[\s\S]{0,50}PASS/.test(text),        fail: /Overlaps[\s\S]{0,50}FAIL/.test(text) },
  };

  // Extract OVL-tagged cells from the table
  const ovlCells = [...text.matchAll(/([A-Za-z ]+)\n[\d.]+\n[\d.—]+\n[\d.%—]+\n[\d.:—]+\n[^\n]*OVL[^\n]*/g)]
    .map(m => m[1].trim());

  // Extract DEF, ASP, ACC failures
  const failLines = text.split('\n').filter(l => /DEF|ASP|ACC|GAR|SLV|OVL/.test(l));

  results.push({ run: i + 1, verdict, checks, ovlCells, failLines });

  const checkStr = Object.entries(checks)
    .map(([k, v]) => v.fail ? `${k.toUpperCase()}:FAIL` : '')
    .filter(Boolean).join(', ') || 'all pass';

  console.log(` ${verdict} | ${checkStr}`);
  if (ovlCells.length) console.log(`   OVL cells: ${ovlCells.join(', ')}`);

  // Clear for next run
  try { await page.click('a[href="/simulation"]'); await page.waitForTimeout(500); } catch {}
  try { await page.click('button:has-text("Clear")'); await page.waitForTimeout(800); } catch {}
}

await browser.close();

console.log('\n══════════════════════════════════════════');
console.log('  VERIFICATION OBSERVATION REPORT');
console.log('══════════════════════════════════════════');
console.log(`Runs: ${results.length}`);
console.log(`Accepted: ${results.filter(r => r.verdict === 'ACCEPTED').length}`);
console.log(`Culled:   ${results.filter(r => r.verdict === 'CULLED').length}`);

const checkNames = ['deficiency','aspectRatio','access','criticalTouch','garageFrontage','slivers','overlaps'];
console.log('\nFail rates:');
for (const name of checkNames) {
  const fails = results.filter(r => r.checks[name]?.fail).length;
  console.log(`  ${name.padEnd(18)}: ${fails}/${results.length} fail`);
}

const allOvl = results.flatMap(r => r.ovlCells);
if (allOvl.length) {
  console.log(`\nOVL-tagged cells across all runs: ${allOvl.join(', ')}`);
}
console.log('══════════════════════════════════════════\n');
