import { test, expect, type Locator } from '@playwright/test';
import { mockFleetBackend } from '../utils/mock-backend';

interface LinkCase {
  label: string;
  href: string;
  /** Visible anchor on the rendered route: { heading } | { text } | { testId }. */
  waitFor: { heading?: string; text?: string; testId?: string };
}

const LINKS: LinkCase[] = [
  { label: 'Docker', href: '/service/docker', waitFor: { text: 'Docker Containers' } },
  { label: 'Storage', href: '/service/storage', waitFor: { heading: 'Storage' } },
  { label: 'System', href: '/service/system', waitFor: { heading: 'System' } },
  { label: 'Network', href: '/service/network', waitFor: { heading: 'Network' } },
  { label: 'Arr', href: '/service/arr', waitFor: { heading: 'Arr' } },
  { label: 'Home Assistant', href: '/service/homeassistant', waitFor: { heading: 'Home Assistant' } },
  { label: 'Nextcloud', href: '/service/nextcloud', waitFor: { heading: 'Nextcloud' } },
  { label: 'AdGuard', href: '/service/adguard', waitFor: { heading: 'AdGuard Home' } },
  { label: 'Ticketing', href: '/ticketing', waitFor: { heading: 'Ticketing' } },
  { label: 'Hermes', href: '/chat', waitFor: { testId: 'chat-page' } },
  { label: 'Settings', href: '/settings', waitFor: { heading: 'Settings' } },
];

test.describe('Sidebar links — every route renders against the stub backend', () => {
  for (const { label, href, waitFor } of LINKS) {
    test(`clicking ${label} renders ${href} with no console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(err.message));

      await mockFleetBackend(page);

      // Ticketing lists tickets on mount; stub it so no 401 noise reaches the console.
      await page.route('**/api/tickets*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ count: 0, tickets: [] }),
        });
      });

      // Hermes opens a websocket to /ws/pty/opencode after minting a ticket;
      // accept it so the stub backend keeps the console clean.
      await page.route('**/ws/pty/**', async (route) => {
        await route.fulfill({
          status: 101,
          headers: {
            connection: 'upgrade',
            upgrade: 'websocket',
            'sec-websocket-accept': 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=',
          },
          body: '',
        });
      });

      await page.goto('/');
      await page.locator('aside').getByRole('link', { name: label }).click();

      let locator: Locator;
      if (waitFor.testId) {
        locator = page.getByTestId(waitFor.testId);
      } else if (waitFor.heading) {
        // ServiceHeader and the page itself both render an h1 with the label;
        // the page's own heading comes last in the DOM.
        locator = page.getByRole('heading', { name: waitFor.heading }).last();
      } else {
        locator = page.getByText(waitFor.text!);
      }
      await expect(locator).toBeVisible();

      // Let in-flight fetches settle, then the console must be clean.
      await page.waitForTimeout(500);
      expect(errors).toEqual([]);
    });
  }
});
