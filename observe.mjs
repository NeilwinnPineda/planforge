import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const logs = [];
page.on('console', msg => logs.push(msg.type() + ': ' + msg.text()));
page.on('pageerror', err => logs.push('PAGE ERROR: ' + err.message));

await page.goto('http://localhost:4200', { waitUntil: 'networkidle', timeout: 20000 });
console.log('URL:', page.url());

// Click through to verification if needed
const navLinks = await page.$$eval('a', els => els.map(e => ({ text: e.textContent?.trim(), href: e.getAttribute('href') })));
console.log('NAV LINKS:', JSON.stringify(navLinks));

// Try to find and click verification link
const verLink = navLinks.find(l => l.text?.toLowerCase().includes('verif'));
if (verLink?.href) {
  await page.goto('http://localhost:4200' + verLink.href, { waitUntil: 'networkidle', timeout: 10000 });
}

await page.waitForTimeout(2000);
console.log('FINAL URL:', page.url());

// Grab all visible text content
const bodyText = await page.$eval('body', el => el.innerText);
console.log('PAGE CONTENT:\n', bodyText.slice(0, 3000));

console.log('CONSOLE LOGS:\n', logs.slice(0, 30).join('\n'));

await browser.close();
