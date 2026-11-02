import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SHOT_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

test.use({ baseURL: 'http://localhost:8798', viewport: { width: 1440, height: 900 } });

test('verify avatar in settings user menu', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => { errors.push(err.message); });

  await page.goto('/settings', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  
  // Click user menu - the button in top right with avatar + "Bradley"
  await page.click('[aria-label="User Menu"]', { timeout: 5000 });
  await page.waitForTimeout(1000);
  
  await page.screenshot({ path: `${SHOT_DIR}/settings-user-menu.png`, fullPage: true });
  fs.writeFileSync(`${SHOT_DIR}/settings-menu-errors.log`, errors.join('\n'));
  console.log('settings menu errors:', errors.length);
  
  // Check avatar text content
  const avatarInfo = await page.evaluate(() => {
    const avatars = document.querySelectorAll('.avatar');
    return Array.from(avatars).map(a => {
      const img = a.querySelector('img');
      const svg = a.querySelector('svg');
      const span = a.querySelector('span');
      return {
        text: a.textContent?.trim(),
        hasImg: !!img,
        hasSvg: !!svg,
        imgSrc: img?.src,
        spanText: span?.textContent?.trim(),
        styleBg: a.style.backgroundColor,
        styleWidth: a.style.width,
        styleHeight: a.style.height,
      };
    });
  });
  console.log('avatars:', JSON.stringify(avatarInfo, null, 2));
  
  // Also check for any img elements in the page
  const imgs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img')).map(img => ({
      src: img.src,
      alt: img.alt,
      width: img.width,
      height: img.height,
    }));
  });
  console.log('all images:', JSON.stringify(imgs, null, 2));
});
