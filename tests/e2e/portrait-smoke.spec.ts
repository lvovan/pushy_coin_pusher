/**
 * T075 — Portrait smoke test.
 *
 * Loads the app at iPhone 14 viewport. Verifies:
 *   - Home overlay shows with Resume disabled (no save yet)
 *   - Tapping Start hides Home and reveals drop-slot tap zones
 *   - Tapping each slot once decreases Coin Bank by 3 from starting bank
 *   - No JS console errors after 5 s of physics simulation
 */
import { expect, test } from '@playwright/test';

test('portrait smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const resumeBtn = page.getByRole('button', { name: /resume/i });
  await expect(resumeBtn).toBeVisible();
  await expect(resumeBtn).toBeDisabled();

  const startBtn = page.getByRole('button', { name: /start/i });
  await startBtn.click();

  const slot0 = page.locator('.drop-slot[data-slot="0"]');
  const slot1 = page.locator('.drop-slot[data-slot="1"]');
  const slot2 = page.locator('.drop-slot[data-slot="2"]');
  await expect(slot0).toBeVisible();

  const bankValue = page.locator('.hud-value').first();
  const starting = Number(await bankValue.textContent());

  await slot0.tap();
  await page.waitForTimeout(300);
  await slot1.tap();
  await page.waitForTimeout(300);
  await slot2.tap();
  await page.waitForTimeout(300);

  const after = Number(await bankValue.textContent());
  expect(starting - after).toBe(3);

  await page.waitForTimeout(5000);
  expect(errors, errors.join('\n')).toEqual([]);
});
