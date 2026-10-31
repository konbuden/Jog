import { test as base } from '@playwright/test';
/** Synthetic fixtures use October 2026. Keep month defaults deterministic without pausing timers. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(new Date('2026-10-31T01:00:00.000Z'));
    await use(page);
  },
});
export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';
