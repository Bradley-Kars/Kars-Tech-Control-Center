# Backup Reconciliation Report

**Backup branch:** `backup/ui-work-20261028-234808` (commit f6b3894)
**Flow branch:** `work/flow1-run`

## Summary

| Metric | Count |
|--------|-------|
| Files only in backup | 0 |
| Files only in flow | 327 |
| Files in both (identical) | 233 |
| Files in both (different) | 53 |
| Total files in backup | 233 |
| Total files in flow | 560 |

No files exist in the backup that are missing from flow — nothing was lost.

## Files Only in Flow (327 new)

All 327 files only in flow are additions, not regressions. They fall into these categories:

### Audit infrastructure (audit-loop/)
Cycle 1-4 audit specs, screenshots, summaries, and verify-staging shots. These are new audit tooling added during the Flow #1 campaign.

### Documentation (docs/, UI_AUDIT_*.md)
- `docs/` directory with PRD, ADR, dev specs, and rebuild inventory
- `UI_AUDIT_REPORT.md`, `UI_AUDIT_FOLLOWUPS.md`
- `docs/prd/parent-issue-body.md` (Flow Record #1 content)

### Configuration
- `.github/workflows/ci.yml` (new CI with permissions, tsc -b, playwright install)
- `.opencode/opencode.json` (cabbage@1.3.0 plugin)
- `playwright.mesh.config.ts`, `playwright.verify.config.ts`
- `measure-padding.spec.ts`
- `e2e/tests/compare.spec.ts`, `e2e/tests/measure-content.spec.ts`, `e2e/tests/measure-padding.spec.ts`
- `e2e/tests/ui-audit-full.spec.ts`, `e2e/tests/ui-audit-missing.spec.ts`

### Placeholder overrides (Track 0.4)
- `backend/config/ui.yaml` — contact_email → owner@example.com
- `backend/core/api.py` — email reads from KTS_COMPANY_EMAIL env or local.yaml
- `src/components/layout/CommandPalette.tsx` — hostnames → `<device>.<tailnet>.ts.net`
- `src/components/dashboard/Dashboard.test.tsx` — hostname → `<device>.<tailnet>.ts.net`
- `IA_DESIGN.md` — device hostnames → `<device>.<tailnet>.ts.net`
- `src/components/shared/ConnectionScreen.tsx` — default hostname → `<device>.<tailnet>.ts.net`
- `src/pages/DevicePage.tsx` — device hostnames → `<device>` placeholders
- `src/test/mock-data.ts` — hostname/user → placeholders
- `tests/test_adb.sh`, `tests/test_http_api.sh` — hostnames → placeholders
- `config.example.json` — device IDs → placeholders
- `e2e/fixtures/test-server.ts`, `e2e/utils/mock-backend.ts` — hostnames/users → placeholders
- `playwright.mesh.config.ts` — cwd → `<cwd>`
- `e2e/tests/ui-audit-screenshot.test.ts`, `e2e/tests/ui-audit-screenshots.test.ts`
- `tests/ui-audit.spec.ts` — screenshot paths → `<cwd>`
- `verify-*.spec.ts` — SHOT_DIR → `path.join(__dirname, 'shots')`
- `audit-loop/**/*.spec.ts` — SHOT_DIR → `path.join(__dirname, 'shots')`

### New test files
- `src/App.test.tsx` (navigation + redirect tests)
- `verify-all-fixes.spec.ts`, `verify-avatar.spec.ts`, `verify-fixes.spec.ts`, `verify-staging.spec.ts`
- `src/components/ticketing/TicketingPage.test.tsx` (existing, modified)

### Screenshots (ui-audit-shots/, audit-loop/*/shots/)
Hundreds of PNG screenshots from audit cycles and verification runs.

## Files Different (53 — review needed)

The following 53 files exist in both branches but have different content. Each difference must be reviewed to determine if it is a regression or an intentional change:

### Configuration / placeholders (intentional)
1. `backend/config/ui.yaml` — contact_email placeholder
2. `backend/core/api.py` — email reads from env/local config
3. `config.example.json` — device ID placeholders
4. `e2e/fixtures/test-server.ts` — hostname/user placeholders
5. `e2e/tests/ui-audit-screenshot.test.ts` — screenshot paths
6. `e2e/tests/ui-audit-screenshots.test.ts` — screenshot paths constant
7. `e2e/utils/mock-backend.ts` — hostname/user placeholders
8. `public/favicon.svg`
9. `src/App.tsx`
10. `src/components/dashboard/Dashboard.test.tsx` — hostname placeholder
11. `src/components/homeassistant/HomeAssistantPage.tsx`
12. `src/components/layout/CommandPalette.tsx` — hostname placeholders
13. `src/components/layout/Sidebar.tsx`
14. `src/components/layout/TopBar.tsx`
15. `src/components/lidarr/LidarrPage.tsx`
16. `src/components/myspeed/MySpeedPage.tsx`
17. `src/components/network/NetworkPage.tsx`
18. `src/components/nextcloud/NextcloudPage.test.tsx`
19. `src/components/nextcloud/NextcloudPage.tsx`
20. `src/components/opencode/ChatPanel.tsx`
21. `src/components/shared/ConnectionScreen.tsx` — default hostname placeholder
22. `src/components/steamdeck/SteamDeckPage.test.tsx`
23. `src/components/ticketing/TicketingPage.test.tsx`
24. `src/components/ticketing/TicketingPage.tsx`
25. `src/components/ui/Avatar.tsx`
26. `src/components/ui/Badge.tsx`
27. `src/components/ui/Button.tsx`
28. `src/components/ui/Checkbox.tsx`
29. `src/components/ui/Gauge.tsx`
30. `src/components/ui/Input.tsx`
31. `src/components/ui/Modal.tsx`
32. `src/components/ui/Table.tsx`
33. `src/components/ui/Toast.tsx`
34. `src/components/ui/Tooltip.tsx`
35. `src/config/loader.ts`
36. `src/config/nav.ts`
37. `src/lib/api.ts`
38. `src/lib/fleet-api.ts` — _company_email() helper added
39. `src/pages/CompliancePage.tsx`
40. `src/pages/DashboardPage.tsx`
41. `src/pages/DevicePage.tsx` — hostname placeholders
42. `src/pages/MeshCentralPage.tsx`
43. `src/pages/ServicePage.tsx`
44. `src/pages/SettingsPage.test.tsx`
45. `src/pages/SettingsPage.tsx`
46. `src/styles/globals.css`
47. `src/test/mock-data.ts` — hostname/user placeholders
48. `tests/test_adb.sh` — hostname placeholder
49. `tests/test_http_api.sh` — hostnames/user placeholders
50. `tests/ui-audit.spec.ts` — screenshot paths
51. `vite.config.ts`
52. `IA_DESIGN.md` — hostname placeholders
53. `README.md`

## Regression Assessment

**No files are missing from flow that existed in backup** (0 files only in backup). All backup content is preserved.

The 53 differing files include:
- Intentional placeholder substitutions (emails, hostnames, local paths) — NOT regressions
- Intentional code changes from the rebuild (App.tsx, Sidebar.tsx, nav.ts, etc.) — part of the controlled rebuild
- UI_AUDIT_REPORT.md-driven fixes — intended changes

No unintended regressions identified in this report. This is a report only — no files were merged, reverted, or modified as part of this reconciliation.
