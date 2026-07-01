import { expect, test } from '@playwright/test';

const routes = [
  { href: '/', title: 'App Next Foundation', navLabel: 'Foundation' },
  { href: '/source', title: 'App Next Source Intake', navLabel: 'Source Intake' },
  { href: '/geometry', title: 'App Next Lot Geometry', navLabel: 'Lot Geometry' },
  { href: '/generation', title: 'App Next Deterministic Generation', navLabel: 'Generation Seeds' },
  { href: '/simulation', title: 'App Next Simulation Engine Foundation', navLabel: 'Simulation' },
  { href: '/processing', title: 'App Next Layout Processing', navLabel: 'Processing' },
  { href: '/verification', title: 'App Next Layout Verification', navLabel: 'Verification' },
  { href: '/construction', title: 'App Next Construction Handoff', navLabel: 'Construction' },
  { href: '/gallery', title: 'App Next Layout Gallery', navLabel: 'Gallery' },
  { href: '/reporting', title: 'App Next Reporting Baseline', navLabel: 'Reporting Baseline' },
] as const;

test('app shell loads with core navigation visible', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Layout Polygon Generator' })).toBeVisible();
  await expect(page.getByText('Structured design source in, canonical polygon layouts out.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'App Next slices' })).toBeVisible();
});

for (const route of routes) {
  test(`route ${route.href} renders through the app shell`, async ({ page }) => {
    await page.goto(route.href);

    await expect(page).toHaveTitle(route.title);
    await expect(page.getByRole('link', { name: route.navLabel })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Layout Polygon Generator' })).toBeVisible();
  });
}
