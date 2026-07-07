import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SOURCE_SCENARIO_PACK } from './source-scenario-pack';

const sourcePath = path.resolve(__dirname, '../src/app/core/source/data/design-source.json');
const validContractPath = path.resolve(
  __dirname,
  '../../../tests/contracts/fixtures/valid/minimal-layout-contract.json',
);
const wideFamilyContractPath = path.resolve(
  __dirname,
  '../generated-exports/wide-family-lot-live-layout-contract.json',
);

const routes = [
  { href: '/', title: 'Planforge Overview', navLabel: 'Overview' },
  { href: '/source', title: 'Planforge Program Setup', navLabel: 'Program Setup' },
  { href: '/geometry', title: 'Planforge Site And Lot', navLabel: 'Site And Lot' },
  { href: '/generation', title: 'Planforge Generation', navLabel: 'Generation' },
  { href: '/simulation', title: 'Planforge Simulation', navLabel: 'Simulation' },
  { href: '/processing', title: 'Planforge Processing', navLabel: 'Processing' },
  { href: '/verification', title: 'Planforge Verification', navLabel: 'Verification' },
  { href: '/gallery', title: 'Planforge Candidate Gallery', navLabel: 'Candidate Gallery' },
  { href: '/construction', title: 'Planforge Construction Output', navLabel: 'Construction Output' },
  { href: '/output-viewer', title: 'Planforge Output Viewer', navLabel: 'Output Viewer' },
  { href: '/reporting', title: 'Planforge Reporting', navLabel: 'Reporting' },
] as const;

type JsonMap = Record<string, unknown>;

function loadJsonFile(filePath: string): JsonMap {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as JsonMap;
}

function loadDefaultSource(): JsonMap {
  return loadJsonFile(sourcePath);
}

async function importJsonFile(page: Page, name: string, json: JsonMap): Promise<void> {
  const fileInput = page.locator('input[type="file"][accept*="json"]').first();
  await fileInput.setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(json, null, 2), 'utf-8'),
  });
}

async function importSourceVariant(
  page: Page,
  name: string,
  mutate: (source: JsonMap) => void,
): Promise<void> {
  const source = loadDefaultSource();
  mutate(source);
  await importJsonFile(page, name, source);
}

async function importScenario(page: Page, scenarioId: string): Promise<void> {
  const scenario = SOURCE_SCENARIO_PACK.find((entry) => entry.id === scenarioId);
  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioId}`);
  }

  await importSourceVariant(page, `${scenario.id}.json`, scenario.mutate);
}

function sidebarLink(page: Page, label: string) {
  return page.locator('.app-shell__phase-link').filter({ hasText: label }).first();
}

async function openWorkflowLink(page: Page, phaseLabel: string, itemLabel: string): Promise<void> {
  const link = sidebarLink(page, itemLabel);
  if (await link.count()) {
    await link.click();
    return;
  }

  await page.getByRole('button', { name: new RegExp(phaseLabel, 'i') }).click();
  await sidebarLink(page, itemLabel).click();
}

test('app shell loads with current navigation and overview messaging visible', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('link', { name: 'Planforge' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Planforge workflow' })).toBeVisible();
  await expect(page.getByText('Residential Layout Studio')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'From project brief to construction-ready layout' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: /Run|Pause/ }).first()).toBeVisible();
});

test('program setup supports room editing and default matrix inspection', async ({ page }) => {
  await page.goto('/source', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('11 room types in use')).toBeVisible();
  await expect(page.getByText('11 total rooms')).toBeVisible();

  await page.locator('#room-to-add').selectOption('office');
  await page.getByRole('button', { name: 'Add Room' }).click({ force: true });

  await expect(page.getByText('12 room types in use')).toBeVisible();

  const officeRow = page.locator('table').first().locator('tbody tr').filter({
    has: page.locator('strong', { hasText: 'Office' }),
  });
  await expect(officeRow).toBeVisible();

  await officeRow.getByRole('button', { name: '+' }).click();
  await expect(page.getByText('13 total rooms')).toBeVisible();

  await page.locator('details.source-inline-disclosure summary').click();
  await expect(page.locator('table.source-table--reference')).toBeVisible();
  await expect(page.locator('table.source-table--reference th').filter({ hasText: 'Office' }).first()).toBeVisible();

  await officeRow.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('11 room types in use')).toBeVisible();
});

test('source import, export, and reset work through the shell controls', async ({ page }) => {
  await page.goto('/source', { waitUntil: 'domcontentloaded' });

  const importedSource = loadDefaultSource();
  const importedMeta = importedSource.meta as JsonMap;
  importedMeta.id = 'playwright-import-source';
  importedMeta.title = 'Playwright Imported Source';
  importedMeta.summary = 'Imported through Playwright.';

  await importJsonFile(page, 'playwright-import-source.json', importedSource);

  await expect(page.locator('.app-shell__source-name')).toContainText('Playwright Imported Source');
  await expect(page.locator('.app-shell__source-name')).toContainText('imported');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('banner').getByRole('button', { name: 'Export', exact: true }).click({ force: true });
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('playwright-import-source.json');

  await page.getByRole('banner').getByRole('button', { name: 'Default', exact: true }).click();
  await expect(page.locator('.app-shell__source-name')).toContainText('Vanilla');
  await expect(page.locator('.app-shell__source-name')).toContainText('default');
});

test('site and lot stage presents the main geometry review surface', async ({ page }) => {
  await page.goto('/geometry', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Lot polygon preview')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Build the lot edge by edge' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Corner coordinates' })).toBeVisible();
  await expect(page.getByText('Closed chain')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Annotated lot and buildable boundary preview' })).toBeVisible();
});

test('site and lot polygon builder supports editing, adding, and removing corners', async ({ page }) => {
  await page.goto('/geometry', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('4 lot points')).toBeVisible();
  const firstSegmentRow = page.locator('.site-segment-editor__row').filter({
    has: page.getByText('P1 to P2'),
  }).first();
  await expect(firstSegmentRow).toContainText('14.00 m');
  await firstSegmentRow.getByRole('button', { name: 'Increase distance' }).click();
  await expect(firstSegmentRow).toContainText('14.10 m');

  await page.getByRole('button', { name: 'Add next corner' }).click({ force: true });
  await expect(page.getByText('5 lot points')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove corner P4' })).toBeVisible();

  await page.getByRole('button', { name: 'Remove corner P4' }).click({ force: true });
  await expect(page.getByText('4 lot points')).toBeVisible();
});

test('site and lot stage shows closure review for non-closing imported surveys', async ({ page }) => {
  await page.goto('/source', { waitUntil: 'domcontentloaded' });

  const importedSource = loadDefaultSource();
  const settings = importedSource.settings as JsonMap;
  const lot = settings.lot as JsonMap;
  const segments = [...(lot.segments as Array<Record<string, unknown>>)];
  segments[3] = { ...segments[3], distance: 19.25 };
  lot.segments = segments;

  await importJsonFile(page, 'playwright-open-lot.json', importedSource);
  await sidebarLink(page, 'Site And Lot').click();

  await expect(page.getByText('Open chain')).toBeVisible();
});

test('site and lot stage shows fail state for imported unbuildable lots', async ({ page }) => {
  await page.goto('/source', { waitUntil: 'domcontentloaded' });

  const importedSource = loadDefaultSource();
  const settings = importedSource.settings as JsonMap;
  const lot = settings.lot as JsonMap;
  lot.segments = [
    { point: 'P1', bearing: 'N 90 00 E', distance: 4, setback: 3, isRrow: true },
    { point: 'P2', bearing: 'N 0 00 W', distance: 4, setback: 3 },
    { point: 'P3', bearing: 'S 90 00 W', distance: 4, setback: 3 },
    { point: 'P4', bearing: 'S 0 00 E', distance: 4, setback: 3 },
  ];

  await importJsonFile(page, 'playwright-unbuildable-lot.json', importedSource);
  await sidebarLink(page, 'Site And Lot').click();

  await expect(page.getByText('Buildable area').locator('..')).toContainText('4.00 sq m');
  await expect(page.getByRole('heading', { level: 2, name: 'Geometry issues' })).toBeVisible();
});

test('generation stage reflects scenario-pack program variants', async ({ page }) => {
  await page.goto('/source', { waitUntil: 'domcontentloaded' });

  await importScenario(page, 'wide-family-lot');
  await expect(page.locator('.app-shell__source-name')).toContainText('Wide Family Lot');
  await openWorkflowLink(page, 'Generate', 'Generation');

  await expect(page.getByText('Wide Family Lot')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Starting positions preview' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Starting position list' })).toBeVisible();
  await expect(page.locator('.generation-seed-row')).toHaveCount(15);
  await expect(page.locator('.generation-seed-row strong', { hasText: 'Family Room' })).toBeVisible();
  await expect(page.locator('.generation-seed-row strong', { hasText: 'Kids Bed 2' })).toBeVisible();
});

test('simulation stage shows live parallel exploration data for imported variants', async ({ page }) => {
  await page.goto('/source', { waitUntil: 'domcontentloaded' });

  await importSourceVariant(page, 'playwright-simulation-variant.json', (source) => {
    const meta = source.meta as JsonMap;
    meta.id = 'playwright-simulation-variant';
    meta.title = 'Playwright Simulation Variant';

    const settings = source.settings as JsonMap;
    const rooms = settings.rooms as JsonMap;
    rooms.program = {
      ...(rooms.program as Record<string, number>),
      office: 1,
      study: 1,
    };
  });

  await expect(page.locator('.app-shell__source-name')).toContainText('Playwright Simulation Variant');
  await openWorkflowLink(page, 'Generate', 'Simulation');

  await expect(page.getByRole('heading', { level: 2, name: 'Watch the layout exploration run live' })).toBeVisible();
  await expect(page.getByText('Current room arrangement inside the lot')).toBeVisible();
  await expect(page.getByText('parallel simulations active')).toBeVisible();
  await expect(page.locator('.simulation-instance')).toHaveCount(1);
  await expect(page.getByText('Room positions (raw)')).toBeVisible();
  await expect(page.locator('.simulation-bubble-row').filter({ hasText: 'Office' }).first()).toBeVisible();
  await expect(page.locator('.simulation-bubble-row').filter({ hasText: 'Study' }).first()).toBeVisible();
});

test('verification route shows the current empty-state message before pipeline inputs exist', async ({ page }) => {
  await page.goto('/verification', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('No layout ready to check')).toBeVisible();
  await expect(page.getByText('Finish Simulation and Processing first, then this page will show the layout checks.')).toBeVisible();
});

test('construction route shows the current empty-state message before a layout is promoted', async ({ page }) => {
  await page.goto('/construction', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('No accepted layout is ready for construction yet.')).toBeVisible();
  await expect(page.getByText('Verification must promote a layout before this page can stage a construction-facing candidate.')).toBeVisible();
});

test('output viewer parses a minimal valid contract fixture', async ({ page }) => {
  await page.goto('/output-viewer', { waitUntil: 'domcontentloaded' });

  const validContract = loadJsonFile(validContractPath);
  const textarea = page.locator('textarea.output-viewer__textarea');
  await textarea.fill(JSON.stringify(validContract, null, 2));
  await page.getByRole('button', { name: 'Parse Pasted JSON' }).click();

  await expect(page.getByRole('heading', { level: 3, name: 'Final output preview' })).toBeVisible();
  await expect(page.getByText('What this output contains')).toBeVisible();
  await expect(page.getByText('LTEST-VALID-001')).toBeVisible();
});

test('output viewer loads the wide-family export and reports current summary counts', async ({ page }) => {
  await page.goto('/output-viewer', { waitUntil: 'domcontentloaded' });

  const wideFamilyContract = loadJsonFile(wideFamilyContractPath);
  const textarea = page.locator('textarea.output-viewer__textarea');
  await textarea.fill(JSON.stringify(wideFamilyContract, null, 2));
  await page.getByRole('button', { name: 'Parse Pasted JSON' }).click();

  await expect(page.getByText('LMR3B19MJ06C90PYKIX')).toBeVisible();
  await expect(page.getByText('Real spaces')).toBeVisible();
  await expect(page.getByText('Hallways and fillers')).toBeVisible();
  await expect(page.locator('.output-viewer__summary-card').filter({ hasText: 'Rooms' })).toContainText('15');
  await expect(page.locator('.output-viewer__summary-card').filter({ hasText: 'Generated cells' })).toContainText('14');
});

test('output viewer shows a parse error for invalid pasted JSON', async ({ page }) => {
  await page.goto('/output-viewer', { waitUntil: 'domcontentloaded' });

  const textarea = page.locator('textarea.output-viewer__textarea');
  await textarea.fill('{ "schemaVersion": "1.0" ');
  await page.getByRole('button', { name: 'Parse Pasted JSON' }).click();

  await expect(page.locator('.output-viewer__error')).toBeVisible();
  await expect(page.getByText(/Could not parse contract JSON|Expected/)).toBeVisible();
});

for (const route of routes) {
  test(`route ${route.href} renders through the app shell`, async ({ page }) => {
    await page.goto(route.href, { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveTitle(route.title);
    await expect(page.getByRole('link', { name: 'Planforge' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Planforge workflow' })).toBeVisible();
    await expect(page.getByRole('link', { name: route.navLabel })).toBeVisible();
  });
}
