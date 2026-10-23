# KTS Master Control — Information Architecture & Navigation Design

## Navigation Hierarchy

```
KTS Master Control (App Root)
├── Fleet Overview (Dashboard)          ← Default landing page
│   ├── Quick Status Grid (All Devices)
│   ├── Critical Alerts
│   └── Quick Actions
├── Devices
│   ├── 🖥  This Machine (Local)        ← Omarchy host
│   ├── 🗄  Unraid Server               ← home-server.tailf6d3b4.ts.net
│   ├── 📱 Galaxy S24 Ultra             ← bradleys-s24-ultra.tailf6d3b4.ts.net
│   ├── 🎮 ROG Ally                     ← lgbtally.tailf6d3b4.ts.net
│   └── 💻 Senpai Laptop                ← senpais-laptop.tailf6d3b4.ts.net
├── Services (Unraid-hosted)
│   ├── 🐳 Docker                       ← Container management
│   ├── 💾 Storage                      ← Array, disks, SMART, shares
│   ├── ⚙️  System                      ← CPU, memory, processes, syslog, plugins
│   ├── 🌐 Network                      ← Interfaces, Tailscale, connectivity
│   ├── 📦 *arr Stack
│   │   ├── 🎬 Radarr
│   │   ├── 📺 Sonarr
│   │   ├── 🎵 Lidarr
│   │   └── 🔍 Prowlarr
│   ├── 🏠 Home Assistant
│   ├── ☁️ Nextcloud
│   ├── 🛡️ AdGuard Home
│   └── 📊 MySpeed
├── Settings
│   ├── 🔗 Connections (Servers)
│   ├── 🎨 Appearance
│   ├── ⌨️ Shortcuts
│   ├── 🔔 Notifications
│   └── 🔐 Security
└── Command Palette (⌘K)              ← Global search & actions
```

---

## Page Structure Templates

### 1. Fleet Overview (Dashboard) — `/`
**Purpose:** Single-pane view of entire fleet health
**Layout:** 3-section responsive grid
- **Section A: Fleet Status Cards** (1 per device) — avatar, name, status badge, key vitals (CPU/Memory/Battery), last seen
- **Section B: Critical Alerts** — aggregated warnings/errors across all services
- **Section C: Quick Actions** — common fleet operations (reboot server, find phone, etc.)

**Polling:** 5s for local, 10s for remote devices

---

### 2. Device Deep-Dive Pages — `/device/:deviceId`
**Purpose:** Complete control & monitoring for one device
**Consistent Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Device Header: [Avatar] [Name] [Status Badge] [Actions...]  │
├─────────────────────────────────────────────────────────────┤
│ Vitals Row: [Gauge: CPU] [Gauge: Memory] [Gauge: Temp]     │
├─────────────────────────────────────────────────────────────┤
│ Tab Navigation: [Overview] [Details] [Logs] [Actions]      │
├─────────────────────────────────────────────────────────────┤
│ Tab Content (scrollable)                                    │
└─────────────────────────────────────────────────────────────┘
```

**Per-Device Tabs:**

| Device | Overview | Details | Logs | Actions |
|--------|----------|---------|------|---------|
| Local | Vitals, GPU, Disk, Network | Processes, Services, Hardware | Systemd journal | Restart shell, Reload Hyprland |
| Unraid | Array, Docker summary, GPU | Disks (SMART), Shares, Plugins | Syslog, Docker logs | Reboot, Shutdown, Run scripts |
| Phone | Battery, Storage, Memory, Network | Apps, SMS, Calls, Contacts, Files | ADB logcat, KDE Connect | Screenshot, Reboot, Ring, RustDesk |
| ROG Ally | Battery, Thermal, GPU, Disk | System stats, Deskflow, Steam | Journalctl | Reboot, Sleep, Fan control |
| Laptop | CPU, Memory, GPU, Disk, Battery | Network, Bluetooth, Updates | Journalctl | Reboot, Update check |

---

### 3. Service Pages — `/service/:serviceId`
**Purpose:** Manage individual Unraid-hosted services
**Consistent Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Service Header: [Icon] [Name] [Health Badge] [Connect]     │
├─────────────────────────────────────────────────────────────┤
│ Key Metrics Row (3-4 Gauges/KPIs)                          │
├─────────────────────────────────────────────────────────────┤
│ Tab Navigation: [Dashboard] [Resources] [Config] [Logs]    │
├─────────────────────────────────────────────────────────────┤
│ Tab Content (Table/Card based)                              │
└─────────────────────────────────────────────────────────────┘
```

**Service-Specific Tabs:**

| Service | Dashboard | Resources | Config | Logs |
|---------|-----------|-----------|--------|------|
| Docker | Container grid (status, CPU, mem, restart) | Images, Volumes, Networks | Compose files | Container logs |
| Storage | Array state, Disk grid (temp, SMART), Shares | SMART details, BTRFS/XFS | Array config, Share config | SMART logs |
| System | CPU/Mem/Load graphs, Top processes | CPU history, Memory, Swap | Plugins, User scripts | Syslog, Journal |
| Network | Interfaces, Tailscale peers, Speed test | Bandwidth, Connections | WireGuard, DNS | Firewall logs |
| Radarr | Health, Queue, Wanted, Diskspace | Indexers, Download clients | Profiles, Quality | API logs |
| Sonarr | Health, Queue, Wanted, Diskspace | Indexers, Download clients | Profiles, Quality | API logs |
| Lidarr | Health, Artists, Albums, Wanted | Indexers, Download clients | Profiles, Quality | API logs |
| Prowlarr | Health, Indexers, Applications | Indexer stats | Apps, Sync | API logs |
| Home Assistant | Areas, Entities, States | Devices, Integrations | Automations, Scripts | HA logs |
| Nextcloud | Storage, Users, Activity, Apps | Shares, Quota | Settings, Apps | NC logs |
| AdGuard | Protection, Queries, Blocked, Clients | Filters, DNS rewrites | Settings, Client config | Query log |
| MySpeed | History chart, Avg speeds, Servers | Test results, Trends | Schedule, Servers | Test logs |

---

### 4. Settings — `/settings`
**Tabs:**
- **Connections** — Add/edit/remove servers, test connectivity, service key management
- **Appearance** — Theme (dark/light/system), density (comfortable/compact), animations
- **Shortcuts** — View/customize keyboard shortcuts
- **Notifications** — Toast preferences, desktop notifications, alert thresholds
- **Security** — API tokens, session management, audit log

---

## Keyboard Shortcuts (Global)

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open Command Palette |
| `⌘1` / `Ctrl+1` | Dashboard (Fleet Overview) |
| `⌘2` / `Ctrl+2` | This Machine |
| `⌘3` / `Ctrl+3` | Unraid Server |
| `⌘4` / `Ctrl+4` | Phone |
| `⌘5` / `Ctrl+5` | ROG Ally |
| `⌘6` / `Ctrl+6` | Laptop |
| `⌘D` / `Ctrl+D` | Docker |
| `⌘S` / `Ctrl+S` | Storage |
| `⌘Y` / `Ctrl+Y` | System |
| `⌘N` / `Ctrl+N` | Network |
| `G` then `D` | Docker (from anywhere) |
| `G` then `S` | Storage |
| `G` then `Y` | System |
| `G` then `N` | Network |
| `?` | Show shortcuts help |
| `Esc` | Close modal/palette/dropdown |
| `Tab` / `Shift+Tab` | Navigate focusable elements |
| `Enter` / `Space` | Activate focused button |
| `↑` / `↓` / `←` / `→` | Navigate lists/grids |

---

## Command Palette Actions

**Navigation:**
- Go to Dashboard
- Go to [Device Name]
- Go to [Service Name]
- Open Settings

**Actions:**
- Refresh All Data
- Reboot Unraid Server
- Shutdown Unraid Server
- Ring Phone
- Screenshot Phone
- Launch RustDesk (Phone)
- Restart Docker Container [selector]
- Run User Script [selector]
- Toggle AdGuard Protection
- Trigger Speed Test

**System:**
- Toggle Theme
- Toggle Density
- Clear Cache
- View Shortcuts
- Check for Updates

---

## Responsive Breakpoints

| Breakpoint | Layout Changes |
|------------|----------------|
| `< 640px` (mobile) | Sidebar → drawer, stacked cards, single-column tables, bottom nav bar |
| `640px - 1024px` (tablet) | Collapsible sidebar, 2-column grids, horizontal scroll tables |
| `1024px - 1536px` (desktop) | Full sidebar, 3-4 column grids, full tables |
| `> 1536px` (ultrawide) | Expanded sidebar with descriptions, 5+ column grids |

---

## State Management Patterns

### Data Fetching
- **React Query / SWR-style** caching with `staleTime: 5000`
- **Optimistic updates** for mutations (reboot, start/stop container, toggle)
- **Background refetch** on window focus
- **Deduplication** — multiple components requesting same data = single request

### Polling Strategy
| Data Type | Interval | Backoff |
|-----------|----------|---------|
| Local vitals | 5s | None |
| Remote device vitals | 10s | 2x on failure (max 60s) |
| Service health | 30s | 2x on failure (max 120s) |
| Docker containers | 5s | None |
| Logs (when viewing) | 2s | None |

### Error Handling
- **Network error** → Show stale data with "offline" indicator, retry silently
- **Auth error** → Prompt for credentials, disable affected sections
- **Server error** → Toast notification, show error boundary in affected section
- **Timeout** → Show skeleton, retry with exponential backoff

---

## Accessibility Requirements

- **Keyboard navigation** — All interactive elements reachable and operable
- **Focus management** — Visible focus rings, logical tab order, trap focus in modals
- **Screen readers** — ARIA labels, live regions for toasts/status changes, semantic HTML
- **Color contrast** — WCAG AA minimum (4.5:1 text, 3:1 UI elements)
- **Reduced motion** — Respect `prefers-reduced-motion`, disable non-essential animations
- **High contrast** — Support forced colors mode

---

## Implementation Priority

1. **Layout System** — App shell, sidebar, top bar, routing
2. **Dashboard** — Fleet status cards, vitals grid, alerts, quick actions
3. **Device Pages** — Local, Unraid (core), Phone, Ally, Laptop
4. **Service Pages** — Docker, Storage, System, Network (core), then *arr, HA, Nextcloud, AdGuard, MySpeed
5. **Settings** — Connections first, then appearance/shortcuts/notifications
6. **Command Palette** — Global search + actions
7. **Polish** — Animations, loading states, error boundaries, a11y audit