import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const sourcePath = path.resolve(__dirname, '../src/app/core/source/data/design-source.json');

const routes = [
  { href: '/', title: 'Planforge Overview', navLabel: 'Overview' },
  { href: '/source', title: 'Planforge Program Setup', navLabel: 'Program Setup' },
  { href: '/geometry', title: 'Planforge Site And Lot', navLabel: 'Site And Lot' },
  { href: '/generation', title: 'Planforge Generation', navLabel: 'Generation' },
  { href: '/simulation', title: 'Planforge Simulation', navLabel: 'Simulation' },
  { href: '/processing', title: 'Planforge Processing', navLabel: 'Processing' },
  { href: '/verification', title: 'Planforge Verification', navLabel: 'Verification' },
  { href: '/construction', title: 'Planforge Construction Output', navLabel: 'Construction Output' },
  { href: '/gallery', title: 'Planforge Candidate Gallery', navLabel: 'Candidate Gallery' },
  { href: '/reporting', title: 'Planforge Reporting', navLabel: 'Reporting' },
] as const;

function loadDefaultSource(): Record<string, unknown> {
  return JSON.parse(readFileSync(sourcePath, 'utf-8')) as Record<string, unknown>;
}

async function importSourceVariant(
  page: Page,
  name: string,
  mutate: (source: Record<string, unknown>) => void,
): Promise<void> {
  const source = loadDefaultSource();
  mutate(source);

  const fileInput = page.locator('input[type="file"][accept*="json"]');
  await fileInput.setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(source, null, 2), 'utf-8'),
  });
}

test('app shell loads with core navigation visible', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { level: 1, name: 'Residential Layout Studio' })).toBeVisible();
  await expect(page.getByText('Set up the project, generate layout options, review what works, and prepare the strongest result for export.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Planforge workflow' })).toBeVisible();
});

test('program setup supports room editing and default matrix inspection', async ({ page }) => {
  await page.goto('/source', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('9 active room types')).toBeVisible();

  await page.locator('#room-to-add').selectOption('office');
  await page.getByRole('button', { name: 'Add Room' }).click({ force: true });

  await expect(page.getByText('10 active room types')).toBeVisible();

  const officeRow = page.locator('table').first().locator('tbody tr').filter({
    has: page.locator('strong', { hasText: 'Office' }),
  });
  await expect(officeRow).toBeVisible();

  await officeRow.locator('input[type="number"]').fill('2');
  await officeRow.locator('input[type="number"]').dispatchEvent('change');
  await expect(page.getByText('11 total room instances')).toBeVisible();

  await page.locator('details.source-inline-disclosure summary').click();
  await expect(page.locator('table.source-table--reference')).toBeVisible();
  await expect(page.locator('table.source-table--reference th').filter({ hasText: 'Office' }).first()).toBeVisible();

  await officeRow.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('9 active room types')).toBeVisible();
  await expect(page.locator('strong', { hasText: 'Office' })).toHaveCount(0);
});

test('program setup edits flow through to generation and simulation', async ({ page }) => {
  await page.goto('/source', { waitUntil: 'domcontentloaded' });

  await page.locator('#room-to-add').selectOption('office');
  await page.getByRole('button', { name: 'Add Room' }).click({ force: true });

  let officeRow = page.locator('table').first().locator('tbody tr').filter({
    has: page.locator('strong', { hasText: 'Office' }),
  });
  await expect(officeRow).toBeVisible();
  await officeRow.locator('input[type="number"]').fill('2');
  await officeRow.locator('input[type="number"]').dispatchEvent('change');

  await page.locator('#room-to-add').selectOption('family_room');
  await page.getByRole('button', { name: 'Add Room' }).click({ force: true });

  const familyRow = page.locator('table').first().locator('tbody tr').filter({
    has: page.locator('strong', { hasText: 'Family Room' }),
  });
  await expect(familyRow).toBeVisible();
  await expect(page.getByText('11 active room types')).toBeVisible();
  await expect(page.getByText('12 total room instances')).toBeVisible();

  await page.getByRole('link', { name: 'Generation' }).click({ force: true });

  await expect(page.getByText('12 active rooms')).toBeVisible();
  await expect(page.getByText('12 seed points')).toBeVisible();
  await expect(page.locator('.generation-preview__seed')).toHaveCount(12);
  await expect(page.locator('.generation-seed-row strong', { hasText: 'Office 2' })).toBeVisible();
  await expect(page.locator('.generation-seed-row strong', { hasText: 'Family Room' })).toBeVisible();

  await page.getByRole('link', { name: 'Simulation' }).click({ force: true });

  await expect(page.getByText('Parallel simulation summary')).toBeVisible();
  const bubblesInViewMetric = page.locator('.simulation-metric').filter({ hasText: 'Bubbles in view' });
  await expect(bubblesInViewMetric).toBeVisible();
  await expect(bubblesInViewMetric).toContainText('14');
  await expect(page.getByText('Visible bubble data')).toBeVisible();
  await expect(page.locator('.simulation-bubble-row strong', { hasText: 'Office' }).first()).toBeVisible();
  await expect(page.locator('.simulation-bubble-row strong', { hasText: 'Family Room' }).first()).toBeVisible();
});

test('source import, export, and reset work through the shell controls', async ({ page }) => {
  await page.goto('/source', { waitUntil: 'domcontentloaded' });

  const importedSource = loadDefaultSource();
  const importedMeta = importedSource.meta as Record<string, unknown>;
  importedMeta.id = 'playwright-import-source';
  importedMeta.title = 'Playwright Imported Source';
  importedMeta.summary = 'Imported through Playwright.';

  const fileInput = page.locator('input[type="file"][accept*="json"]');
  await fileInput.setInputFiles({
    name: 'playwright-import-source.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedSource, null, 2), 'utf-8'),
  });

  await expect(page.locator('.app-shell__source-detail')).toContainText('Playwright Imported Source');
  await expect(page.locator('.app-shell__source-detail')).toContainText('imported source');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click({ force: true });
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('playwright-import-source.json');

  await page.getByRole('button', { name: 'Use Default' }).click();
  await expect(page.locator('.app-shell__source-detail')).toContainText('Minimal Residential');
  await expect(page.locator('.app-shell__source-detail')).toContainText('default source');
});

test('site and lot stage presents a dominant geometry review surface', async ({ page }) => {
  await page.goto('/geometry', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Lot polygon preview')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Survey segment editor' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'World-space point viewer' })).toBeVisible();
  await expect(page.getByText('Polygon status: Closed')).toBeVisible();
  await expect(page.locator('svg')).toBeVisible();
});

test('site and lot polygon builder supports editing, adding, and removing corners', async ({ page }) => {
  await page.goto('/geometry', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('4 lot points')).toBeVisible();
  const firstDistanceInput = page.locator('.site-segment-editor__row input[type="number"]').first();
  await firstDistanceInput.fill('15.500');
  await firstDistanceInput.dispatchEvent('change');
  await expect(firstDistanceInput).toHaveValue('15.500');

  await page.getByRole('button', { name: 'Add next corner' }).click({ force: true });
  await expect(page.getByText('5 lot points')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove corner P2' })).toBeVisible();

  await page.getByRole('button', { name: 'Remove corner P2' }).click({ force: true });
  await expect(page.getByText('4 lot points')).toBeVisible();
});

test('site and lot builder lets an edge be toggled as rrow', async ({ page }) => {
  await page.goto('/geometry', { waitUntil: 'domcontentloaded' });

  const rrowToggles = page.locator('.site-boundary-schedule__toggle input[type="checkbox"]');
  await expect(rrowToggles.nth(0)).toBeChecked();
  await expect(rrowToggles.nth(1)).not.toBeChecked();

  await rrowToggles.nth(1).check({ force: true });
  await expect(rrowToggles.nth(1)).toBeChecked();
});

test('site and lot boundary schedule lets setback distances be edited', async ({ page }) => {
  await page.goto('/geometry', { waitUntil: 'domcontentloaded' });

  const setbackInput = page.locator('.site-boundary-schedule .site-measure-field input[type="number"]').nth(1);
  await setbackInput.fill('4.50');
  await setbackInput.dispatchEvent('change');
  await expect(setbackInput).toHaveValue('4.50');
  await expect(page.getByText('Buildable area')).toBeVisible();
});

test('site and lot stage shows a closure line for non-closing imported surveys', async ({ page }) => {
  await page.goto('/source', { waitUntil: 'domcontentloaded' });

  const importedSource = loadDefaultSource();
  const settings = importedSource.settings as Record<string, unknown>;
  const lot = settings.lot as Record<string, unknown>;
  const segments = [...(lot.segments as Array<Record<string, unknown>>)];
  segments[3] = { ...segments[3], distance: 19.25 };
  lot.segments = segments;

  const fileInput = page.locator('input[type="file"][accept*="json"]');
  await fileInput.setInputFiles({
    name: 'playwright-open-lot.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedSource, null, 2), 'utf-8'),
  });

  await page.getByRole('link', { name: 'Site And Lot' }).click({ force: true });

  await expect(page.locator('.site-preview__closure')).toHaveCount(1);
  await expect(page.locator('.site-status-chip--review')).toContainText('Review');
});

test('site and lot stage shows a fail catch for imported unbuildable lots', async ({ page }) => {
  await page.goto('/source', { waitUntil: 'domcontentloaded' });

  const importedSource = loadDefaultSource();
  const settings = importedSource.settings as Record<string, unknown>;
  const lot = settings.lot as Record<string, unknown>;
  lot.segments = [
    { point: 'P1', bearing: 'N 90 00 E', distance: 4, setback: 3, isRrow: true },
    { point: 'P2', bearing: 'N 0 00 W', distance: 4, setback: 3 },
    { point: 'P3', bearing: 'S 90 00 W', distance: 4, setback: 3 },
    { point: 'P4', bearing: 'S 0 00 E', distance: 4, setback: 3 },
  ];

  const fileInput = page.locator('input[type="file"][accept*="json"]');
  await fileInput.setInputFiles({
    name: 'playwright-unbuildable-lot.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedSource, null, 2), 'utf-8'),
  });

  await page.getByRole('link', { name: 'Site And Lot' }).click({ force: true });

  await expect(page.locator('.site-status-chip--fail')).toContainText('Fail');
  await expect(page.getByRole('heading', { level: 2, name: 'Geometry issues' })).toBeVisible();
});

test('generation stage reflects imported source program variants', async ({ page }) => {
  await page.goto('/source', { waitUntil: 'domcontentloaded' });

  await importSourceVariant(page, 'playwright-generation-variant.json', (source) => {
    const meta = source.meta as Record<string, unknown>;
    meta.id = 'playwright-generation-variant';
    meta.title = 'Playwright Generation Variant';

    const settings = source.settings as Record<string, unknown>;
    const rooms = settings.rooms as Record<string, unknown>;
    rooms.program = {
      ...(rooms.program as Record<string, number>),
      office: 2,
      family_room: 1,
      breakfast_nook: 1,
    };
  });

  await page.getByRole('link', { name: 'Generation' }).click({ force: true });

  await expect(page.getByText('Playwright Generation Variant')).toBeVisible();
  await expect(page.getByText('13 active rooms')).toBeVisible();
  await expect(page.getByText('13 seed points')).toBeVisible();
  await expect(page.locator('.generation-preview__seed')).toHaveCount(13);
  await expect(page.getByRole('heading', { level: 2, name: 'Seed schedule' })).toBeVisible();
  await expect(page.locator('.generation-seed-row strong', { hasText: 'Family Room' })).toBeVisible();
  await expect(page.locator('.generation-seed-row strong', { hasText: 'Office 2' })).toBeVisible();
});

test('simulation stage shows compact per-simulation data for imported source variants', async ({ page }) => {
  await page.goto('/source', { waitUntil: 'domcontentloaded' });

  await importSourceVariant(page, 'playwright-simulation-variant.json', (source) => {
    const meta = source.meta as Record<string, unknown>;
    meta.id = 'playwright-simulation-variant';
    meta.title = 'Playwright Simulation Variant';

    const settings = source.settings as Record<string, unknown>;
    const rooms = settings.rooms as Record<string, unknown>;
    rooms.program = {
      ...(rooms.program as Record<string, number>),
      office: 1,
      study: 1,
    };
  });

  await page.getByRole('link', { name: 'Simulation' }).click({ force: true });

  await expect(page.getByRole('heading', { level: 2, name: 'Watch the layout exploration run live' })).toBeVisible();
  await expect(page.getByText(/running/i).first()).toBeVisible();
  await expect(page.getByText(/total sims/i)).toBeVisible();
  await expect(page.locator('.simulation-instance')).toHaveCount(1);
  await expect(page.getByText('Parallel simulation summary')).toBeVisible();
  await expect(page.getByText('Visible bubble data')).toBeVisible();
  await expect(page.getByText('Office')).toBeVisible();
  await expect(page.getByText('Study')).toBeVisible();
});

for (const route of routes) {
  test(`route ${route.href} renders through the app shell`, async ({ page }) => {
    await page.goto(route.href, { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveTitle(route.title);
    await expect(page.getByRole('link', { name: route.navLabel })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Residential Layout Studio' })).toBeVisible();
  });
}
