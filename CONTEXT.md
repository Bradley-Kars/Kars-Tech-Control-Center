# Project Context — KTS Master Control

## Domain Terminology

| Term | Definition |
|------|------------|
| KTS Master Control | The web app (Kars-Tech-Control-Center) — fleet management for Unraid servers, Windows PCs, Galaxy S24 Ultra, ROG Ally, MSI laptop |
| Ticketing | Ticket management page — create, view, filter, sort, worklog tickets |
| MeshCentral | Remote management platform for fleet devices |
| Fleet Command | Quick actions page — reboot, shutdown, shell exec across fleet |
| Dashboard | Fleet overview with gauges (CPU, MEM, GPU, TEMP) and critical alerts |
| Device Page | Per-device detail view (local, unraid, phone, ally, laptop) |
| Service Page | Per-service health page (docker, storage, system, network, lidarr, homeassistant, nextcloud, adguard) |
| Settings | Appearance, notifications, keyboard shortcuts, meshcentral, about |
| Alert Center | Alert management — ratings, severity, acknowledgment |
| Compliance | Patch compliance — check all devices for pending OS/package updates |
| Chat | Hermes chat interface — connect to local sidecar |
| Tailscale | Mesh VPN network (<tailnet>.ts.net) — used for cross-machine communication |
| Mullvad | VPN provider for qBittorrent traffic |
| *arr apps | Radarr, Sonarr, Lidarr, Prowlarr, qBittorrent, Bazarr, Soularr, Slskd, Plex, Jellyseerr — media stack on Unraid |
| qBittorrent | Torrent client on Unraid, routes through Mullvad VPN |

## Navigation Structure

- `/` → redirects to `/ticketing`
- `/dashboard` — Fleet Overview (gauges, critical alerts)
- `/device/:deviceId` — Device detail (local, unraid, phone, ally, laptop)
- `/service/:serviceId` — Service health (docker, storage, system, network, lidarr, homeassistant, nextcloud, adguard)
- `/meshcentral` — MeshCentral fleet management
- `/fleet-command` — Fleet command (quick actions)
- `/compliance` — Patch compliance
- `/alerts` — Alert center
- `/chat` — Hermes chat
- `/ticketing` — Ticket management
- `/settings/*` — Settings (appearance, notifications, shortcuts, meshcentral, about)

## UI Component Library

- `src/components/ui/` — Button, Input, Badge, Card, Table, Skeleton, Gauge, Modal, Toast, Avatar, Tooltip, Checkbox, Select (in Input)
- `src/components/layout/` — Sidebar, TopBar, CommandPalette, ErrorBoundary, PageHeader

## Key Config Files

- `src/config/nav.ts` — Navigation items (SIDEBAR_ITEMS, NAV_ITEMS)
- `src/styles/globals.css` — Tailwind CSS design tokens (`--kts-*`)
- `src/context/AppContext.tsx` — Theme, density, reduced motion, notifications, sidebar collapsed
- `src/lib/tauri-commands.ts` — Tauri bridge commands (invoke wrapper)
