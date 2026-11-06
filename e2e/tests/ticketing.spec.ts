import { test, expect } from '@playwright/test';

/**
 * U1: Closed tickets never show — unless the client asks for them.
 *
 * The bridge returns open statuses by default (GET /tickets); GET
 * /tickets?all=true returns open + closed/cancelled/resolved.
 * This stub mimics that behaviour so the check is red before the fix
 * (All shows open-only) and green after (All shows everything).
 */
test.describe('Ticketing — All includes closed/resolved/cancelled (U1)', () => {
  const allTickets = [
    { id: 'TKT-2026-201', title: 'Email deliverability remediation', status: 'closed', client_name: 'ORG-000001', priority: 'medium' },
    { id: 'TKT-2026-202', title: 'Microphone and speaker setup', status: 'open', client_name: 'CUS-000001', priority: 'medium' },
    { id: 'TKT-2026-203', title: 'Laptop repair', status: 'resolved', client_name: 'CUS-000002', priority: 'high' },
    { id: 'TKT-2026-204', title: 'Printer queue stuck', status: 'open', client_name: 'CUS-000003', priority: 'low' },
    { id: 'TKT-2026-205', title: 'Cancelled migration', status: 'cancelled', client_name: 'CUS-000004', priority: 'low' },
  ];

  const CLOSED_STATUSES = new Set(['closed', 'cancelled', 'resolved']);

  test('All shows every ticket; Closed shows only closed/cancelled/resolved; header counts open only', async ({
    page,
  }) => {
    await page.route('**/api/tickets*', async (route) => {
      const all = route.request().url().includes('all=true');
      const tickets = all
        ? allTickets
        : allTickets.filter((t) => !CLOSED_STATUSES.has(t.status));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: tickets.length, tickets }),
      });
    });

    await page.goto('/ticketing');

    // The mount request must ask for ?all=true so All shows everything.
    const res = await page.waitForResponse((resp) => resp.url().includes('/api/tickets'));
    expect(res.url()).toContain('all=true');

    for (const t of allTickets) {
      await expect(page.getByTestId(`ticket-row-${t.id}`)).toBeVisible();
    }
    await expect(page.getByText('2 open')).toBeVisible();

    // 'Closed' requests ?all=true again and shows only closed/cancelled/resolved.
    await page.getByTestId('filter-chip-closed').click();
    await page.waitForResponse((resp) => resp.url().includes('/api/tickets'));
    await expect(page.getByTestId('ticket-row-TKT-2026-201')).toBeVisible();
    await expect(page.getByTestId('ticket-row-TKT-2026-203')).toBeVisible();
    await expect(page.getByTestId('ticket-row-TKT-2026-205')).toBeVisible();
    await expect(page.getByTestId('ticket-row-TKT-2026-202')).not.toBeVisible();
    await expect(page.getByTestId('ticket-row-TKT-2026-204')).not.toBeVisible();
    await expect(page.getByText('2 open')).toBeVisible();
  });
});
