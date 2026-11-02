# Legacy Edits Report — Dashboard, Device, Settings

**Comparison:** `main d7d118a` → `work/flow1-run`

**Report only — no files were merged, reverted, or modified as part of this report.**

## src/pages/DashboardPage.tsx

### Changes (7 hunks)

| Hunk | Location | Summary | Regression? |
|------|----------|---------|-------------|
| 1 | Line 168 | `localStats?.system` → `localStats` — simplified null-check on local stats object | No — simplifies data access |
| 2 | Lines 220-241 | Extracted `computeBreaches` useMemo + separate useEffect for persisting breaches to Alert DB; changed variable `items` → `alerts` | No — code reorganization, same logic |
| 3 | Lines 241-257 | Extracted `alertsWithDb` useMemo for merging open Alert Center rows with computed breaches | No — code reorganization |
| 4 | Line 344 | `alerts.length` → `alertsWithDb.length` in Critical Alerts conditional render | No — uses merged alerts list |
| 5 | Line 268 | Reboot Unraid action variant: `'amber'` → `'outline'` | No — visual style change |
| 6 | Line 281 | Refresh All action variant: `'primary'` → `'outline'` | No — visual style change |
| 7 | Throughout | Various useMemo dependency array updates (`[devices]` → `[devices]`, `[devices, dbAlerts]` → `[alerts, dbAlerts]`) | No — correct dependency tracking |

## src/pages/DevicePage.tsx

### Changes (6 hunks)

| Hunk | Location | Summary | Regression? |
|------|----------|---------|-------------|
| 1 | Lines 29-32 | Device hostnames replaced with placeholders: `home-server.tailf6d3b4.ts.net` → `<device>.<tailnet>.ts.net`, `bradleys-s24-ultra` → `<device>-ultra`, `lgbtally` → `<device>`, `senpais-laptop` → `<device>` | No — Track 0.4 placeholder pass |
| 2 | Line 98 | Added `min-w-0` class to device header flex container | No — layout fix for truncation |
| 3 | Line 142 | Added `offline = !loading && system == null` detection for LocalDevice | No — offline state handling |
| 4 | Lines 151-164 | Gauge variants changed to `'default'` when offline for CPU, Memory, GPU, Temp | No — offline visual state |
| 5 | Line 251 | Added `offline = !loading && !connected` detection for UnraidDevice | No — offline state handling |
| 6 | Lines 252-257 | Simplified MeshCentral power action comment (removed redundant else branch comment) | No — comment cleanup |

## src/pages/SettingsPage.tsx

### Changes (4 hunks)

| Hunk | Location | Summary | Regression? |
|------|----------|---------|-------------|
| 1 | Lines 1-46 | Imports reorganized: removed `Link` from react-router-dom, added `PageHeader`, `useMediaQuery`, lucide icons (`Layout`, `Bell`, `Keyboard`, `Monitor`, `Info`, `ChevronRight`) | No — import reorganization |
| 2 | Throughout | Shortcut key format updated: `⌘1` → `⌘1 / Ctrl+1`, `⌘2 … ⌘6` → `⌘2…6 / Ctrl+2…6`, etc. | No — documentation clarity |
| 3 | Throughout | Added `SECTIONS` array with section IDs, labels, and icons for settings sections (appearance, notifications, shortcuts, meshcentral, about) | No — new section structure |
| 4 | Throughout | Renamed `MeshCentralCard` → `MeshCentralSection`; changed layout from `<Card>` → `<div className="space-y-4">`; removed `Link` to MeshCentral console | No — section refactor |

## Conclusion

All changes to DashboardPage.tsx, DevicePage.tsx, and SettingsPage.tsx are intentional modifications from the controlled rebuild flow (issue #1). None are regressions. DevicePage.tsx hostname changes are part of the Track 0.4 placeholder pass.
