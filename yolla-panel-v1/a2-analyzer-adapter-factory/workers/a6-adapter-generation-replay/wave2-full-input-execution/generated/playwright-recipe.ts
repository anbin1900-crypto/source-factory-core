import { test, expect } from '@playwright/test';

// Generated from B-3 recorded actions and A-4 locator candidates.
test('A6 wave2 exact 10 extraction', async ({ page }) => {
  await page.goto(process.env.TEST_SITE_URL + '/search');
  await page.getByTestId('keyword-input').fill('apartment');
  await page.getByTestId('region-select').selectOption('seoul');
  await page.getByTestId('search-submit-new').click();
  await page.evaluate(() => window.scrollTo(0, 850));
  const cards = page.locator('.property-card');
  await expect(cards).toHaveCount(10);
});
