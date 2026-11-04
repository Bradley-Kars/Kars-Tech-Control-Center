# Staging Smoke Checklist

This document provides a smoke-test checklist for the KTS Master Control staging environment. Use this checklist to verify that a new deployment is healthy before promoting to production.

**Important**: Do not touch staging or production directly without proper authorization. This document lists the URLs and checks to perform as placeholders.

## Prerequisites

- Staging environment URL: `<staging-base-url>` (placeholder)
- Backend API base URL: `<staging-backend-url>` (placeholder, typically `<staging-base-url>:8799`)
- Valid test credentials for the staging environment

## 1. Smoke Test Checklist

### 1.1. Backend Health

| # | Check | URL/Endpoint | Expected Result | Pass/Fail |
|---|-------|-------------|-----------------|-----------|
| 1.1.1 | Backend responds | `GET <backend-url>/api/fleet/servers` | HTTP 200, JSON array | ☐ |
| 1.1.2 | System stats endpoint | `GET <backend-url>/api/fleet/local/stats` | HTTP 200, JSON object with hostname, cpu_usage, memory_usage_pct | ☐ |
| 1.1.3 | No server error responses | Any endpoint | No HTTP 500 errors | ☐ |

### 1.2. Frontend Routes

| # | Route | Expected Page Title/Heading | Pass/Fail |
|---|-------|----------------------------|-----------|
| 1.2.1 | `/` | Dashboard | ☐ |
| 1.2.2 | `/dashboard` | Dashboard | ☐ |
| 1.2.3 | `/network` | Network | ☐ |
| 1.2.4 | `/system` | System | ☐ |
| 1.2.5 | `/storage` | Storage | ☐ |
| 1.2.6 | `/nextcloud` | Nextcloud | ☐ |
| 1.2.7 | `/adguard` | AdGuard | ☐ |
| 1.2.7 | `/homeassistant` | Home Assistant | ☐ |
| 1.2.8 | `/docker` | Docker | ☐ |
| 1.2.9 | `/mesh-central` | MeshCentral | ☐ |
| 1.2.10 | `/phone` | Phone | ☐ |
| 1.2.11 | `/settings` | Settings | ☐ |
| 1.2.12 | `/ticketing` | Ticketing | ☐ |
| 1.2.13 | `/fleet-command` | Fleet Command | ☐ |
| 1.2.14 | `/compliance` | Compliance | ☐ |
| 1.2.15 | `/chat` | Hermes (chat) | ☐ |

### 1.3. Service Health Cards

| # | Service | Card/Heading Text | Pass/Fail |
|---|---------|-------------------|-----------|
| 1.3.1 | Plex | Plex card visible | ☐ |
| 1.3.2 | Nextcloud | Nextcloud card visible | ☐ |
| 1.3.3 | Home Assistant | Home Assistant card visible | ☐ |
| 1.3.4 | AdGuard | AdGuard Home card visible | ☐ |
| 1.3.5 | Lidarr | Lidarr card visible | ☐ |
| 1.3.6 | Docker | Docker container count card visible | ☐ |

### 1.4. Key User Flows

| # | Flow | Steps | Pass/Fail |
|---|------|-------|-----------|
| 1.4.1 | Server add/edit | Navigate to Settings → Servers → Add server → Fill form → Save → Server appears in list | ☐ |
| 1.4.2 | Test connection | Settings → Servers → Test Connection → Success message displayed | ☐ |
| 1.4.3 | Service toggle | Settings → Services → Toggle service on/off → State changes | ☐ |
| 1.4.4 | Terminal access | Device page → Open terminal → Terminal shell loads | ☐ |
| 1.4.5 | Ticket creation | Ticketing → Create ticket → Ticket appears in list | ☐ |

### 1.5. Authentication & Authorization

| # | Check | Expected Result | Pass/Fail |
|---|-------|-----------------|-----------|
| 1.5.1 | No auth required for read | GET `/api/fleet/servers` without token returns 401 | ☐ |
| 1.5.2 | Valid token works | GET `/api/fleet/servers` with valid token returns 200 | ☐ |
| 1.5.2 | Invalid token rejected | GET `/api/fleet/servers` with invalid token returns 401/403 | ☐ |

### 1.6. WebSocket Terminal

| # | Check | Expected Result | Pass/Fail |
|---|-------|-----------------|-----------|
| 1.6.1 | WebSocket connects | `wss://<staging-base-url>/ws/pty/opencode` connects | ☐ |
| 1.6.2 | Auth required | WebSocket without token returns 4401 | ☐ |
| 1.6.3 | Terminal output | Sending input returns shell output | ☐ |

## 2. Placeholder Values

Replace the following placeholders with actual staging values before running the checklist:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `<staging-base-url>` | Staging frontend URL | `https://staging.kts.example.com` |
| `<backend-url>` | Staging backend URL | `https://staging-api.kts.example.com:8799` |
| `<device>.<tailnet>.ts.net` | Tailscale hostname | `<device>.<tailnet>.ts.net` |

## 3. Pass/Fail Criteria

- **All checks must pass** before promoting to production.
- Any `FAIL` result must be investigated and resolved before promotion.
- Warning-level issues (non-critical) may be noted but do not block promotion.

## 4. Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Tester | | | |
| Approver | | | |

---

*This is a staging environment smoke test checklist. Do not modify production systems or data.*
