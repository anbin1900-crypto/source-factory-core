import { chromium } from 'playwright';

export async function runRecipe(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://fixture.local/search", { waitUntil: 'domcontentloaded' });
  await page.getByTestId("keyword-input").fill("apartment");
  await page.getByTestId("region-select").selectOption("seoul");
  await page.getByTestId("search-submit-new").click();
  await page.evaluate(() => window.scrollTo(0, 850));
  const [detailPage] = await Promise.all([context.waitForEvent('page'), page.getByTestId("details-link").click()]);
  await detailPage.waitForLoadState('domcontentloaded');
  // frame enter: "resultFrame"
  await detailPage.frameLocator("[data-yolla-frame=resultFrame]").goto("https://fixture.local/details/1", { waitUntil: 'domcontentloaded' });
  // frame exit: "resultFrame"
  await browser.close();
}
