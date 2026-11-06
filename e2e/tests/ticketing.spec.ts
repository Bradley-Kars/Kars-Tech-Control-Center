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

/**
 * U4: Contrast — placeholder text on the ticketing page.
 *
 * The search input's placeholder is painted with --kts-text-tertiary
 * (--kts-color-line) on the input background (--kts-bg-tertiary). It must
 * meet WCAG AA (4.5:1) so the "Search or jump to…"-style bar does not look
 * disabled. The ratio is computed from computed styles, so a transparent
 * placeholder token fails here red.
 */
test.describe('Ticketing — placeholder contrast (U4)', () => {
  const allTickets = [
    { id: 'TKT-2026-301', title: 'Email deliverability remediation', status: 'closed', client_name: 'ORG-000001', priority: 'medium' },
    { id: 'TKT-2026-302', title: 'Microphone and speaker setup', status: 'open', client_name: 'CUS-000001', priority: 'medium' },
  ];

  const CLOSED_STATUSES = new Set(['closed', 'cancelled', 'resolved']);

  test('search input placeholder passes WCAG AA contrast against the input background', async ({
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
    await page.waitForResponse((resp) => resp.url().includes('/api/tickets'));

    const input = page.getByPlaceholder('Search id, title, client…');
    await expect(input).toBeVisible();

    const ratio = await input.evaluate((el) => {
      const parse = (css: string): { r: number; g: number; b: number; a: number } => {
        const m = css.match(
          /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
        );
        if (!m) throw new Error(`unparsed color: ${css}`);
        return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
      };
      const fg = parse(window.getComputedStyle(el, '::placeholder').color);
      const bg = parse(window.getComputedStyle(el).backgroundColor);
      const a = fg.a;
      const painted = {
        r: fg.r * a + bg.r * (1 - a),
        g: fg.g * a + bg.g * (1 - a),
        b: fg.b * a + bg.b * (1 - a),
      };
      const lin = (c: number) => {
        const x = c / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      const lum = (c: { r: number; g: number; b: number }) =>
        0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      const l1 = lum(painted);
      const l2 = lum(bg);
      const hi = Math.max(l1, l2);
      const lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    });

    // eslint-disable-next-line no-console
    console.log(`placeholder contrast: ${ratio.toFixed(2)}:1 (min 4.5:1)`);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
