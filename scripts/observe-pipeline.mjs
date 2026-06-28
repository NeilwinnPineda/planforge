/**
 * Pipeline observation script — headless multi-run analysis.
 * Runs the simulation N times, captures a layout each time, reads the
 * full processing pipeline output, and builds a structured report.
 *
 * Usage: node scripts/observe-pipeline.mjs [runs=20]
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Neilwinn Pineda/AppData/Local/Temp/pw-temp/node_modules/playwright');

const RUNS = parseInt(process.argv[2] ?? '20');
const APP_URL = 'http://localhost:4300';
const CAPTURE_POLL_MS = 4000;
const CAPTURE_TIMEOUT_MS = 90000;

// ── helpers ────────────────────────────────────────────────────────────────────

function extractMetric(text, label) {
  const re = new RegExp(label + '\\s*([\\d.]+)');
  return parseFloat(text.match(re)?.[1] ?? 'NaN');
}

function extractText(text, label) {
  const re = new RegExp(label + '\\s*([^\\n]+)');
  return text.match(re)?.[1]?.trim() ?? '';
}

function parseProcessingPage(text) {
  const result = {
    layoutId: extractText(text, 'Layout ID'),
    sourceScore: extractMetric(text, 'Source score'),
    capturedBubbles: extractMetric(text, 'Captured bubbles'),

    step0_placedBubbles: extractMetric(text, 'Placed bubbles'),

    step1_generatedCells: extractMetric(text, 'Generated cells'),
    step1_droppedDegenerate: extractMetric(text, 'Dropped degenerate cells'),

    step2_hallwaySites: extractMetric(text, 'Hallway sites'),
    step2_outputCells: text.match(/Hallway injection[\s\S]*?Output cells\s*(\d+)/)?.[1],

    step3_warpedSites: extractMetric(text, 'Warped sites'),
    step3_iterations: text.match(/Warped orthogonalization[\s\S]*?Iteration count\s*(\d+)/)?.[1],
    step3_stableRuns: text.match(/Warped orthogonalization[\s\S]*?Stable runs\s*(\d+)/)?.[1],

    step4_iterations: text.match(/Mass balance renegotiation[\s\S]*?Iteration count\s*(\d+)/)?.[1],
    step4_finalMaxDeviation: text.match(/Final max deviation\s*([\d.]+)/)?.[1],

    step5_projectedSites: text.match(/Projected sites\s*(\d+)/)?.[1],
    step5_skippedDegenerate: text.match(/Skipped degenerate\s*(\d+)/)?.[1],

    step6_rebalanceIterations: text.match(/Warped Voronoi rebalance[\s\S]*?Iterations\s*(\d+)/)?.[1],
    step6_stableRuns: text.match(/Warped Voronoi rebalance[\s\S]*?Stable runs\s*(\d+)/)?.[1],
    step6_finalMaxDelta: text.match(/Final max delta\s*([\d.]+)/)?.[1],
    step6_converged: !text.includes('ran 18 iterations without full convergence'),

    step7_outputCells: text.match(/UV Voronoi boxing[\s\S]*?Output cells\s*(\d+)/)?.[1],
    step7_usedFallback: text.includes('UV Voronoi boxing produced') && text.includes('fallback to unsnapped boxes'),

    step8_outputCells: text.match(/UV edge negotiation[\s\S]*?Output cells\s*(\d+)/)?.[1],
    step8_negotiationPasses: text.match(/Negotiation passes\s*(\d+)/)?.[1],
    step8_aspectRescues: text.match(/Aspect ratio rescues\s*(\d+)/)?.[1],
    step8_usedFallback: text.includes('fallback — overlap detected'),
    step8_cellLoss: null, // computed below

    step9_outputCells: text.match(/Residual UV absorption[\s\S]*?Output cells\s*(\d+)/)?.[1],
    step9_residualCells: text.match(/Residual cells\s*(\d+)/)?.[1],
    step9_absorbedIntoRooms: text.match(/Absorbed into rooms\s*(\d+)/)?.[1],

    step14_totalCells: text.match(/Final staged output[\s\S]*?Output cells\s*(\d+)/)?.[1],
    step14_totalArea: text.match(/Total area\s*([\d.]+)/)?.[1],
    step14_roomCells: text.match(/Room cells\s*(\d+)/)?.[1],
    step14_hallwayCells: text.match(/Hallway cells\s*(\d+)/)?.[1],

    // Per-cell deltas from the output table
    cellDeltas: [],
  };

  // Compute hallway cell loss (step 8 drops hallways since they're excluded from UV back-projection)
  const s7 = parseInt(result.step7_outputCells ?? '0');
  const s8 = parseInt(result.step8_outputCells ?? '0');
  result.step8_cellLoss = s7 - s8;

  // Parse individual cell area deltas from the output table
  const cellRows = [...text.matchAll(/^(\w[\w_]*)\n[^\n]+\n[^\n]+\n([\d.]+) sq m\ntarget ([\d.]+) sq m\ndelta (-?[\d.]+)/gm)];
  for (const [, id, area, target, delta] of cellRows) {
    result.cellDeltas.push({ id, area: parseFloat(area), target: parseFloat(target), delta: parseFloat(delta) });
  }

  return result;
}

function summarizeRun(run, index) {
  const issues = [];
  if (run.step7_usedFallback) issues.push('9C-fallback');
  if (run.step8_usedFallback) issues.push('9D-fallback');
  if (run.step8_cellLoss > 0) issues.push(`hallway-loss:${run.step8_cellLoss}`);
  if (parseInt(run.step9_residualCells) === 0) issues.push('no-residuals');
  if (!run.step6_converged) issues.push('9B-no-converge');
  const bigDeltas = run.cellDeltas.filter(c => Math.abs(c.delta) > 0.5);
  if (bigDeltas.length) issues.push(`big-delta(${bigDeltas.length})`);

  return {
    run: index + 1,
    layoutId: run.layoutId,
    score: run.sourceScore,
    bubbles: run.capturedBubbles,
    hallwaySites: run.step2_hallwaySites,
    massBalanceMaxDev: parseFloat(run.step4_finalMaxDeviation),
    rebalanceConverged: run.step6_converged,
    rebalanceMaxDelta: parseFloat(run.step6_finalMaxDelta),
    boxingFallback: run.step7_usedFallback,
    negotiationFallback: run.step8_usedFallback,
    negotiationPasses: parseInt(run.step8_negotiationPasses),
    hallwayLoss: run.step8_cellLoss,
    residualCells: parseInt(run.step9_residualCells),
    finalCells: parseInt(run.step14_totalCells),
    finalArea: parseFloat(run.step14_totalArea),
    issues,
    cellDeltas: run.cellDeltas,
  };
}

function printReport(runs) {
  console.log('\n\n══════════════════════════════════════════════════');
  console.log('  PIPELINE OBSERVATION REPORT');
  console.log(`  ${runs.length} runs completed`);
  console.log('══════════════════════════════════════════════════\n');

  // Per-run summary table
  console.log('── PER-RUN SUMMARY ────────────────────────────────');
  for (const r of runs) {
    const issueStr = r.issues.length ? `  ⚠ ${r.issues.join(', ')}` : '  ✓ clean';
    console.log(`Run ${String(r.run).padStart(2)} | score ${r.score?.toFixed(2) ?? '?'} | cells ${r.finalCells ?? '?'} | area ${r.finalArea?.toFixed(1) ?? '?'} sqm | hallway-loss ${r.hallwayLoss ?? '?'}${issueStr}`);
  }

  // Aggregate stats
  const valid = runs.filter(r => !isNaN(r.finalArea));
  const fallbackRate9C = runs.filter(r => r.boxingFallback).length / runs.length;
  const fallbackRate9D = runs.filter(r => r.negotiationFallback).length / runs.length;
  const avgHallwayLoss = runs.reduce((s, r) => s + (r.hallwayLoss ?? 0), 0) / runs.length;
  const avgResiduals = runs.reduce((s, r) => s + (r.residualCells ?? 0), 0) / runs.length;
  const convergeRate = runs.filter(r => r.rebalanceConverged).length / runs.length;
  const avgMaxDelta = runs.reduce((s, r) => s + (r.rebalanceMaxDelta ?? 0), 0) / runs.length;

  console.log('\n── AGGREGATE STATS ─────────────────────────────────');
  console.log(`9B Rebalance converge rate  : ${(convergeRate * 100).toFixed(0)}%`);
  console.log(`9B Avg final max delta      : ${avgMaxDelta.toFixed(4)}`);
  console.log(`9C Boxing fallback rate     : ${(fallbackRate9C * 100).toFixed(0)}%`);
  console.log(`9D Negotiation fallback rate: ${(fallbackRate9D * 100).toFixed(0)}%`);
  console.log(`9D Avg hallway cell loss    : ${avgHallwayLoss.toFixed(1)}`);
  console.log(`9E Avg residual cells       : ${avgResiduals.toFixed(1)}`);

  // Cell delta analysis across all runs
  const allDeltas = runs.flatMap(r => r.cellDeltas);
  const byType = {};
  for (const c of allDeltas) {
    const type = c.id.replace(/_\d+$/, '');
    if (!byType[type]) byType[type] = [];
    byType[type].push(c.delta);
  }
  console.log('\n── AREA DELTA BY ROOM TYPE (avg across runs) ───────');
  for (const [type, deltas] of Object.entries(byType).sort()) {
    const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    const max = Math.max(...deltas.map(Math.abs));
    const bar = avg > 0 ? '+'.repeat(Math.min(10, Math.round(avg * 10))) : '-'.repeat(Math.min(10, Math.round(-avg * 10)));
    console.log(`  ${type.padEnd(22)} avg ${avg.toFixed(3).padStart(7)}  max |Δ| ${max.toFixed(3)}  ${bar}`);
  }

  // Key findings
  console.log('\n── KEY FINDINGS ────────────────────────────────────');
  if (fallbackRate9D > 0.5) {
    console.log('⚠ CRITICAL: 9D negotiation is falling back >50% of runs — overlap in boxing output is systematic');
  }
  if (avgHallwayLoss > 2) {
    console.log('⚠ CRITICAL: Hallway cells are being lost at 9D — UV back-projection excludes hallways, residual absorption should recover them but isn\'t');
  }
  if (avgResiduals < 1) {
    console.log('⚠ CRITICAL: 9E producing 0 residuals — room boxes are covering hallway UV space, no gaps left for residual generation');
  }
  if (convergeRate < 0.5) {
    console.log('⚠ WARNING: 9B rebalance converges in <50% of runs — consider more iterations or adjusted gain');
  }
  console.log('\n══════════════════════════════════════════════════\n');
}

// ── main ──────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});

const page = await browser.newPage();
const allRuns = [];

console.log(`Starting ${RUNS}-run pipeline observation...\n`);

for (let i = 0; i < RUNS; i++) {
  process.stdout.write(`Run ${i + 1}/${RUNS}: loading simulation...`);

  // Navigate to simulation (fresh state on first run, cleared state on subsequent)
  await page.goto(`${APP_URL}/simulation`, { waitUntil: 'networkidle', timeout: 20000 });

  // Poll for capture
  const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
  let captured = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(CAPTURE_POLL_MS);
    const captures = await page.evaluate(() =>
      parseInt(document.body.innerText.match(/(\d+) captures/)?.[1] ?? '0')
    );
    const ticks = await page.evaluate(() =>
      document.body.innerText.match(/(\d+) ticks/)?.[1] ?? '?'
    );
    process.stdout.write(` tick${ticks}`);
    if (captures > 0) {
      captured = true;
      break;
    }
  }

  if (!captured) {
    console.log(` TIMEOUT — skipping run ${i + 1}`);
    // Clear and try next
    try { await page.click('button:has-text("Clear cluster")'); await page.waitForTimeout(1000); } catch {}
    continue;
  }

  // Navigate to processing
  process.stdout.write(' → processing...');
  await page.click('a[href="/processing"]');
  await page.waitForTimeout(4000);
  const text = await page.evaluate(() => document.body.innerText);

  if (text.includes('WAITING FOR CAPTURED LAYOUT')) {
    console.log(' MISSED CAPTURE — retrying next run');
    await page.goto(`${APP_URL}/simulation`, { waitUntil: 'networkidle', timeout: 10000 });
    try { await page.click('button:has-text("Clear cluster")'); await page.waitForTimeout(500); } catch {}
    continue;
  }

  const parsed = parseProcessingPage(text);
  const summary = summarizeRun(parsed, i);
  allRuns.push(summary);
  console.log(` ✓ score=${summary.score?.toFixed(2)} cells=${summary.finalCells} issues=[${summary.issues.join(',')}]`);

  // Clear cluster for next run
  await page.goto(`${APP_URL}/simulation`, { waitUntil: 'networkidle', timeout: 10000 });
  try {
    await page.click('button:has-text("Clear cluster")');
    await page.waitForTimeout(800);
  } catch {}
}

await browser.close();
printReport(allRuns);
