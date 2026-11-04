# UI_AUDIT_FOLLOWUPS.md
# Subjective / Design Items Requiring Human Review

The following items were deferred from the audit loop because they require
product/design decisions beyond unambiguous visual/UX fixes. They are NOT
blockers for convergence.

## EMPTY-001 — Empty-state copy inconsistency (P2, copy/design)
Routes: /dashboard, /ticketing, /meshcentral, /compliance, /device/*
Issue: Empty states use different copy ("No tickets found", "No devices found
in MeshCentral", "No devices reported by the array", "Loading…" plain text).
Recommendation: Define a single empty-state pattern (illustration + copy +
optional CTA) and migrate all empty states to it. This is a copy/voice
decision, not a bug.
Suggested owner: product/design

## GLOBAL-001 — No consistent empty-state illustration style (P3, design)
Related to EMPTY-001. No shared EmptyState component exists; skeletons exist
but several pages use plain "Loading…" text.
Suggested owner: product/design

## GLOBAL-003 — English only; no i18n (P3, product)
All copy is hardcoded English. Adding i18n is a product decision.
Suggested owner: product/engineering

## SVC-003 — Service subpages not deep-audited (P3, coverage)
Routes /service/lidarr, /homeassistant, /nextcloud, /adguard,
/storage, /system, /network exist but were only screenshot-captured, not
audited against the full state matrix.
Suggested: schedule a dedicated audit pass if these pages are high-traffic.

## ALERT-001 — Alerts page not deep-audited (P3, coverage)
/alerts exists in route tree + Sidebar nav but not reviewed against full state
matrix (empty/loading/error, acknowledgment flows, filter behavior).
Suggested: schedule a dedicated audit pass.

## FLEET-001 — Fleet Command page not deep-audited (P3, coverage)
/fleet-command exists but not reviewed against full state matrix.
Suggested: schedule a dedicated audit pass.

## CHAT-002 — Chat empty/offline state (P2, design)
Chat panel is entirely blank when Hermes offline. Adding an integrated
offline placeholder is a UX/copy decision.
Suggested owner: product/design
