# Tauri command inventory — docs/tauri-port/COMMANDS.md

Master checklist for Phase 2 (port services to the web API) and the parity 
gate for Phase 4 (delete Tauri). One row per `invoke('...')` command found in 
`src/lib/tauri-commands.ts`. Generated automatically; regenerate when the command 
set changes.

- **Total invoke commands**: 172
- **Status**: `not ported` — no FastAPI route / `src/lib/fleet-api.ts` function exists yet (Phase 2 work).
- **Rust handler**: `src-tauri/src/...:<line>` where the `#[tauri::command]` is defined.
- **UI files**: files under `src/` that import the matching camelCase TS wrapper.
- **Target route**: the planned `/api/fleet/...` route (or websocket) that replaces the Tauri IPC call.

## Servers (CRUD + connection test)

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `test_connection` | src-tauri/src/commands/mod.rs:66 | src/components/shared/ConnectionScreen.tsx | POST /api/fleet/test_connection | ported |
| `save_server` | src-tauri/src/commands/mod.rs:229 | src/App.test.tsx, src/hooks/index.ts | POST /api/fleet/servers | ported |
| `remove_server` | src-tauri/src/commands/mod.rs:241 | src/App.test.tsx, src/hooks/index.ts | DELETE /api/fleet/servers/{id} | ported |
| `get_servers` | src-tauri/src/commands/mod.rs:249 | src/App.test.tsx, src/hooks/index.ts, src/pages/ServicePage.test.tsx | GET /api/fleet/servers | ported |

## Docker

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `docker_start` | src-tauri/src/commands/mod.rs:636 | src/components/docker/DockerPage.test.tsx, src/components/docker/DockerPage.tsx | /api/fleet/docker/start | ported |
| `docker_stop` | src-tauri/src/commands/mod.rs:653 | src/components/docker/DockerPage.test.tsx, src/components/docker/DockerPage.tsx | /api/fleet/docker/stop | ported |
| `docker_restart` | src-tauri/src/commands/mod.rs:670 | src/components/docker/DockerPage.test.tsx, src/components/docker/DockerPage.tsx | /api/fleet/docker/restart | ported |
| `docker_logs` | src-tauri/src/commands/mod.rs:687 | src/components/docker/DockerPage.test.tsx, src/components/docker/DockerPage.tsx | /api/fleet/docker/logs | ported |
| `docker_remove` | src-tauri/src/commands/mod.rs:724 | src/components/docker/DockerPage.test.tsx, src/components/docker/DockerPage.tsx | /api/fleet/docker/remove | not ported |

## Unraid emhttp

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `get_system_stats` | src-tauri/src/commands/mod.rs:255 | src/App.test.tsx, src/hooks/index.ts | /api/fleet/system/stats | ported |
| `get_docker_containers` | src-tauri/src/commands/mod.rs:584 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx, src/components/docker/DockerPage.test.tsx, src/components/docker/DockerPage.tsx | /api/fleet/unraid/get_docker_containers | ported |
| `get_gpu_info` | src-tauri/src/commands/mod.rs:896 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx | /api/fleet/unraid/get_gpu_info | ported |
| `get_disks` | src-tauri/src/commands/mod.rs:767 | src/components/storage/StoragePage.test.tsx, src/components/storage/StoragePage.tsx | /api/fleet/unraid/get_disks | ported |
| `get_smart_data` | src-tauri/src/commands/mod.rs:753 | src/components/storage/StoragePage.test.tsx, src/components/storage/StoragePage.tsx | /api/fleet/unraid/get_smart_data | ported |
| `get_shares` | src-tauri/src/commands/mod.rs:848 | src/components/storage/StoragePage.test.tsx, src/components/storage/StoragePage.tsx | /api/fleet/unraid/get_shares | ported |
| `get_processes` | src-tauri/src/commands/mod.rs:907 | src/components/system/SystemPage.test.tsx, src/components/system/SystemPage.tsx | /api/fleet/unraid/get_processes | not ported |
| `get_syslog` | src-tauri/src/commands/mod.rs:918 | src/components/system/SystemPage.test.tsx, src/components/system/SystemPage.tsx | /api/fleet/unraid/get_syslog | not ported |
| `get_user_scripts` | src-tauri/src/commands/mod.rs:933 | src/components/system/SystemPage.test.tsx, src/components/system/SystemPage.tsx | /api/fleet/unraid/get_user_scripts | not ported |
| `run_user_script` | src-tauri/src/commands/mod.rs:1011 | src/components/system/SystemPage.test.tsx, src/components/system/SystemPage.tsx | /api/fleet/unraid/run_user_script | not ported |
| `get_plugins` | src-tauri/src/commands/mod.rs:944 | src/components/system/SystemPage.test.tsx, src/components/system/SystemPage.tsx | /api/fleet/unraid/get_plugins | not ported |
| `get_network_interfaces` | src-tauri/src/commands/mod.rs:963 | src/components/network/NetworkPage.test.tsx, src/components/network/NetworkPage.tsx | /api/fleet/unraid/get_network_interfaces | not ported |
| `get_tailscale_peers` | src-tauri/src/commands/mod.rs:973 | src/components/network/NetworkPage.test.tsx, src/components/network/NetworkPage.tsx | /api/fleet/unraid/get_tailscale_peers | not ported |
| `reboot_server` | src-tauri/src/commands/mod.rs:983 | — | /api/fleet/unraid/reboot_server | not ported |
| `shutdown_server` | src-tauri/src/commands/mod.rs:997 | — | /api/fleet/unraid/shutdown_server | not ported |
| `get_array_info` | src-tauri/src/commands/mod.rs:1026 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx | /api/fleet/unraid/get_array_info | ported |

## Nextcloud

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `get_nextcloud_info` | src-tauri/src/commands/mod.rs:1206 | src/components/nextcloud/NextcloudPage.test.tsx, src/components/nextcloud/NextcloudPage.tsx | /api/fleet/nextcloud/info | ported |
| `get_nextcloud_status` | src-tauri/src/commands/mod.rs:1216 | src/components/nextcloud/NextcloudPage.test.tsx, src/components/nextcloud/NextcloudPage.tsx | /api/fleet/nextcloud/status | ported |
| `get_nextcloud_storage` | src-tauri/src/commands/mod.rs:1229 | src/components/nextcloud/NextcloudPage.test.tsx, src/components/nextcloud/NextcloudPage.tsx | /api/fleet/nextcloud/storage | ported |
| `get_nextcloud_users` | src-tauri/src/commands/mod.rs:1242 | src/components/nextcloud/NextcloudPage.test.tsx, src/components/nextcloud/NextcloudPage.tsx | /api/fleet/nextcloud/users | ported |
| `get_nextcloud_activity` | src-tauri/src/commands/mod.rs:1252 | src/components/nextcloud/NextcloudPage.test.tsx, src/components/nextcloud/NextcloudPage.tsx | /api/fleet/nextcloud/activity | ported |

## Lidarr

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `get_lidarr_status` | src-tauri/src/commands/mod.rs:1266 | src/components/lidarr/LidarrPage.test.tsx, src/components/lidarr/LidarrPage.tsx | /api/fleet/lidarr/get_lidarr_status | not ported |
| `get_lidarr_health` | src-tauri/src/commands/mod.rs:1279 | — | /api/fleet/lidarr/get_lidarr_health | not ported |
| `get_lidarr_artists` | src-tauri/src/commands/mod.rs:1289 | src/components/lidarr/LidarrPage.test.tsx, src/components/lidarr/LidarrPage.tsx | /api/fleet/lidarr/get_lidarr_artists | not ported |
| `get_lidarr_albums` | src-tauri/src/commands/mod.rs:1299 | src/components/lidarr/LidarrPage.test.tsx, src/components/lidarr/LidarrPage.tsx | /api/fleet/lidarr/get_lidarr_albums | not ported |
| `get_lidarr_wanted` | src-tauri/src/commands/mod.rs:1312 | src/components/lidarr/LidarrPage.test.tsx, src/components/lidarr/LidarrPage.tsx | /api/fleet/lidarr/get_lidarr_wanted | not ported |
| `get_lidarr_queue` | src-tauri/src/commands/mod.rs:1325 | — | /api/fleet/lidarr/get_lidarr_queue | not ported |
| `get_lidarr_diskspace` | src-tauri/src/commands/mod.rs:1335 | src/components/lidarr/LidarrPage.test.tsx, src/components/lidarr/LidarrPage.tsx | /api/fleet/lidarr/get_lidarr_diskspace | not ported |
| `lidarr_refresh_artist` | src-tauri/src/commands/mod.rs:1345 | src/components/lidarr/LidarrPage.test.tsx, src/components/lidarr/LidarrPage.tsx | /api/fleet/lidarr/lidarr_refresh_artist | not ported |
| `lidarr_search_missing` | src-tauri/src/commands/mod.rs:1359 | src/components/lidarr/LidarrPage.test.tsx, src/components/lidarr/LidarrPage.tsx | /api/fleet/lidarr/lidarr_search_missing | not ported |

## Home Assistant

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `get_homeassistant_states` | src-tauri/src/commands/mod.rs:1373 | — | /api/fleet/homeassistant/get_homeassistant_states | not ported |
| `get_homeassistant_config` | src-tauri/src/commands/mod.rs:1383 | — | /api/fleet/homeassistant/get_homeassistant_config | not ported |
| `get_homeassistant_areas` | src-tauri/src/commands/mod.rs:1393 | — | /api/fleet/homeassistant/get_homeassistant_areas | not ported |
| `get_homeassistant_devices` | src-tauri/src/commands/mod.rs:1403 | — | /api/fleet/homeassistant/get_homeassistant_devices | not ported |
| `get_homeassistant_entities` | src-tauri/src/commands/mod.rs:1413 | — | /api/fleet/homeassistant/get_homeassistant_entities | not ported |
| `homeassistant_toggle` | src-tauri/src/commands/mod.rs:1426 | — | /api/fleet/homeassistant/homeassistant_toggle | not ported |
| `homeassistant_turn_on` | src-tauri/src/commands/mod.rs:1440 | — | /api/fleet/homeassistant/homeassistant_turn_on | not ported |
| `homeassistant_turn_off` | src-tauri/src/commands/mod.rs:1454 | — | /api/fleet/homeassistant/homeassistant_turn_off | not ported |

## MySpeed

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `get_myspeed_summary` | src-tauri/src/commands/mod.rs:1468 | — | /api/fleet/myspeed/summary | not ported |
| `get_myspeed_tests` | src-tauri/src/commands/mod.rs:1479 | — | /api/fleet/myspeed/tests | not ported |
| `get_myspeed_servers` | src-tauri/src/commands/mod.rs:1493 | — | /api/fleet/myspeed/servers | not ported |

## AdGuard Home

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `get_adguard_status` | src-tauri/src/commands/mod.rs:1503 | — | /api/fleet/adguard/get_adguard_status | not ported |
| `get_adguard_stats` | src-tauri/src/commands/mod.rs:1513 | — | /api/fleet/adguard/get_adguard_stats | not ported |
| `get_adguard_query_log` | src-tauri/src/commands/mod.rs:1523 | — | /api/fleet/adguard/get_adguard_query_log | not ported |
| `get_adguard_clients` | src-tauri/src/commands/mod.rs:1538 | — | /api/fleet/adguard/get_adguard_clients | not ported |
| `get_adguard_filters` | src-tauri/src/commands/mod.rs:1548 | — | /api/fleet/adguard/get_adguard_filters | not ported |
| `get_adguard_dhcp` | src-tauri/src/commands/mod.rs:1558 | — | /api/fleet/adguard/get_adguard_dhcp | not ported |
| `adguard_enable` | src-tauri/src/commands/mod.rs:1568 | src/components/adguard/AdGuardPage.test.tsx, src/components/adguard/AdGuardPage.tsx | /api/fleet/adguard/adguard_enable | not ported |
| `adguard_disable` | src-tauri/src/commands/mod.rs:1578 | src/components/adguard/AdGuardPage.test.tsx, src/components/adguard/AdGuardPage.tsx | /api/fleet/adguard/adguard_disable | not ported |

## Phone (host-local)

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `get_phone_device_info` | src-tauri/src/commands/mod.rs:1589 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx, src/components/phone/PhonePage.tsx | /api/fleet/phone/get_phone_device_info (host-local, feature-flagged) | not ported |
| `get_phone_battery` | src-tauri/src/commands/mod.rs:1599 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx, src/components/phone/PhonePage.tsx | /api/fleet/phone/get_phone_battery (host-local, feature-flagged) | not ported |
| `get_phone_thermal` | src-tauri/src/commands/mod.rs:1609 | src/components/phone/PhonePage.tsx | /api/fleet/phone/get_phone_thermal (host-local, feature-flagged) | not ported |
| `get_phone_storage` | src-tauri/src/commands/mod.rs:1619 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx, src/components/phone/PhonePage.tsx | /api/fleet/phone/get_phone_storage (host-local, feature-flagged) | not ported |
| `get_phone_memory` | src-tauri/src/commands/mod.rs:1629 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx, src/components/phone/PhonePage.tsx | /api/fleet/phone/get_phone_memory (host-local, feature-flagged) | not ported |
| `get_phone_cpu` | src-tauri/src/commands/mod.rs:1639 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx | /api/fleet/phone/get_phone_cpu (host-local, feature-flagged) | not ported |
| `get_phone_screen` | src-tauri/src/commands/mod.rs:1646 | src/components/phone/PhonePage.tsx | /api/fleet/phone/get_phone_screen (host-local, feature-flagged) | not ported |
| `get_phone_network` | src-tauri/src/commands/mod.rs:1656 | src/components/phone/PhonePage.tsx | /api/fleet/phone/get_phone_network (host-local, feature-flagged) | not ported |
| `get_phone_apps` | src-tauri/src/commands/mod.rs:1666 | — | /api/fleet/phone/get_phone_apps (host-local, feature-flagged) | not ported |
| `get_phone_processes` | src-tauri/src/commands/mod.rs:1679 | — | /api/fleet/phone/get_phone_processes (host-local, feature-flagged) | not ported |
| `get_phone_activity` | src-tauri/src/commands/mod.rs:1692 | src/components/phone/PhonePage.tsx | /api/fleet/phone/get_phone_activity (host-local, feature-flagged) | not ported |
| `phone_set_screen` | src-tauri/src/commands/mod.rs:1705 | src/components/phone/PhonePage.tsx | /api/fleet/phone/phone_set_screen (host-local, feature-flagged) | not ported |
| `phone_set_brightness` | src-tauri/src/commands/mod.rs:1719 | — | /api/fleet/phone/phone_set_brightness (host-local, feature-flagged) | not ported |
| `phone_set_auto_brightness` | src-tauri/src/commands/mod.rs:1733 | — | /api/fleet/phone/phone_set_auto_brightness (host-local, feature-flagged) | not ported |
| `phone_volume_up` | src-tauri/src/commands/mod.rs:1747 | src/components/phone/PhonePage.tsx | /api/fleet/phone/phone_volume_up (host-local, feature-flagged) | not ported |
| `phone_volume_down` | src-tauri/src/commands/mod.rs:1754 | src/components/phone/PhonePage.tsx | /api/fleet/phone/phone_volume_down (host-local, feature-flagged) | not ported |
| `phone_reboot` | src-tauri/src/commands/mod.rs:1764 | src/components/phone/PhonePage.tsx | /api/fleet/phone/phone_reboot (host-local, feature-flagged) | not ported |
| `phone_screenshot` | src-tauri/src/commands/mod.rs:1771 | src/components/layout/CommandPalette.tsx, src/components/phone/PhonePage.tsx | /api/fleet/phone/phone_screenshot (host-local, feature-flagged) | not ported |
| `phone_screenshot_save` | src-tauri/src/commands/mod.rs:1782 | — | /api/fleet/phone/phone_screenshot_save (host-local, feature-flagged) | not ported |
| `phone_force_stop_app` | src-tauri/src/commands/mod.rs:1799 | — | /api/fleet/phone/phone_force_stop_app (host-local, feature-flagged) | not ported |
| `phone_get_sms_inbox` | src-tauri/src/commands/mod.rs:1813 | — | /api/fleet/phone/phone_get_sms_inbox (host-local, feature-flagged) | not ported |
| `phone_get_sms_by_address` | src-tauri/src/commands/mod.rs:1827 | src/components/phone/PhonePage.tsx | /api/fleet/phone/phone_get_sms_by_address (host-local, feature-flagged) | not ported |
| `phone_get_sms_conversations` | src-tauri/src/commands/mod.rs:1841 | src/components/phone/PhonePage.tsx | /api/fleet/phone/phone_get_sms_conversations (host-local, feature-flagged) | not ported |
| `phone_send_sms` | src-tauri/src/commands/mod.rs:1854 | — | /api/fleet/phone/phone_send_sms (host-local, feature-flagged) | not ported |
| `launch_rustdesk` | src-tauri/src/commands/mod.rs:1869 | src/components/layout/CommandPalette.tsx, src/components/phone/PhonePage.tsx | /api/fleet/phone/launch_rustdesk (host-local, feature-flagged) | not ported |
| `phone_get_contacts` | src-tauri/src/commands/mod.rs:2183 | src/components/phone/PhonePage.tsx | /api/fleet/phone/phone_get_contacts (host-local, feature-flagged) | not ported |
| `phone_get_call_log` | src-tauri/src/commands/mod.rs:2193 | src/components/phone/PhonePage.tsx | /api/fleet/phone/phone_get_call_log (host-local, feature-flagged) | not ported |

## KDE Connect (host-local)

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `get_kdeconnect_battery` | src-tauri/src/commands/mod.rs:1890 | — | /api/fleet/kdeconnect/get_kdeconnect_battery (host-local, feature-flagged) | not ported |
| `get_kdeconnect_notifications` | src-tauri/src/commands/mod.rs:1900 | — | /api/fleet/kdeconnect/get_kdeconnect_notifications (host-local, feature-flagged) | not ported |
| `get_kdeconnect_notification` | src-tauri/src/commands/mod.rs:1913 | — | /api/fleet/kdeconnect/get_kdeconnect_notification (host-local, feature-flagged) | not ported |
| `get_kdeconnect_mpris` | src-tauri/src/commands/mod.rs:1927 | — | /api/fleet/kdeconnect/get_kdeconnect_mpris (host-local, feature-flagged) | not ported |
| `kdeconnect_mpris_play` | src-tauri/src/commands/mod.rs:1937 | — | /api/fleet/kdeconnect/kdeconnect_mpris_play (host-local, feature-flagged) | not ported |
| `kdeconnect_mpris_pause` | src-tauri/src/commands/mod.rs:1947 | — | /api/fleet/kdeconnect/kdeconnect_mpris_pause (host-local, feature-flagged) | not ported |
| `kdeconnect_mpris_play_pause` | src-tauri/src/commands/mod.rs:1957 | — | /api/fleet/kdeconnect/kdeconnect_mpris_play_pause (host-local, feature-flagged) | not ported |
| `kdeconnect_mpris_next` | src-tauri/src/commands/mod.rs:1967 | — | /api/fleet/kdeconnect/kdeconnect_mpris_next (host-local, feature-flagged) | not ported |
| `kdeconnect_mpris_previous` | src-tauri/src/commands/mod.rs:1977 | — | /api/fleet/kdeconnect/kdeconnect_mpris_previous (host-local, feature-flagged) | not ported |
| `kdeconnect_mpris_set_volume` | src-tauri/src/commands/mod.rs:1987 | — | /api/fleet/kdeconnect/kdeconnect_mpris_set_volume (host-local, feature-flagged) | not ported |
| `get_kdeconnect_connectivity` | src-tauri/src/commands/mod.rs:2001 | — | /api/fleet/kdeconnect/get_kdeconnect_connectivity (host-local, feature-flagged) | not ported |
| `get_kdeconnect_telephony` | src-tauri/src/commands/mod.rs:2011 | — | /api/fleet/kdeconnect/get_kdeconnect_telephony (host-local, feature-flagged) | not ported |
| `kdeconnect_ring_device` | src-tauri/src/commands/mod.rs:2021 | — | /api/fleet/kdeconnect/kdeconnect_ring_device (host-local, feature-flagged) | not ported |
| `kdeconnect_send_ping` | src-tauri/src/commands/mod.rs:2031 | — | /api/fleet/kdeconnect/kdeconnect_send_ping (host-local, feature-flagged) | not ported |
| `kdeconnect_send_sms` | src-tauri/src/commands/mod.rs:2045 | — | /api/fleet/kdeconnect/kdeconnect_send_sms (host-local, feature-flagged) | not ported |
| `kdeconnect_send_clipboard` | src-tauri/src/commands/mod.rs:2060 | — | /api/fleet/kdeconnect/kdeconnect_send_clipboard (host-local, feature-flagged) | not ported |
| `kdeconnect_get_clipboard` | src-tauri/src/commands/mod.rs:2074 | — | /api/fleet/kdeconnect/kdeconnect_get_clipboard (host-local, feature-flagged) | not ported |
| `get_kdeconnect_contacts` | src-tauri/src/commands/mod.rs:2084 | — | /api/fleet/kdeconnect/get_kdeconnect_contacts (host-local, feature-flagged) | not ported |
| `kdeconnect_sftp_list` | src-tauri/src/commands/mod.rs:2094 | — | /api/fleet/kdeconnect/kdeconnect_sftp_list (host-local, feature-flagged) | not ported |
| `kdeconnect_share_file` | src-tauri/src/commands/mod.rs:2108 | — | /api/fleet/kdeconnect/kdeconnect_share_file (host-local, feature-flagged) | not ported |
| `kdeconnect_share_url` | src-tauri/src/commands/mod.rs:2119 | — | /api/fleet/kdeconnect/kdeconnect_share_url (host-local, feature-flagged) | not ported |
| `kdeconnect_share_text` | src-tauri/src/commands/mod.rs:2130 | — | /api/fleet/kdeconnect/kdeconnect_share_text (host-local, feature-flagged) | not ported |
| `kdeconnect_get_conversations` | src-tauri/src/commands/mod.rs:2141 | — | /api/fleet/kdeconnect/kdeconnect_get_conversations (host-local, feature-flagged) | not ported |
| `kdeconnect_reply_conversation` | src-tauri/src/commands/mod.rs:2154 | — | /api/fleet/kdeconnect/kdeconnect_reply_conversation (host-local, feature-flagged) | not ported |
| `kdeconnect_request_conversation` | src-tauri/src/commands/mod.rs:2169 | — | /api/fleet/kdeconnect/kdeconnect_request_conversation (host-local, feature-flagged) | not ported |
| `kdeconnect_list_devices` | src-tauri/src/commands/mod.rs:2203 | — | /api/fleet/kdeconnect/kdeconnect_list_devices (host-local, feature-flagged) | not ported |

## Steam Deck / handheld (host-local)

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `steamdeck_get_system_stats` | src-tauri/src/commands/mod.rs:2241 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx, src/components/steamdeck/SteamDeckPage.test.tsx, src/components/steamdeck/SteamDeckPage.tsx | /api/fleet/handheld/steamdeck_get_system_stats (host-local, feature-flagged) | not ported |
| `steamdeck_get_battery` | src-tauri/src/commands/mod.rs:2251 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx, src/components/steamdeck/SteamDeckPage.test.tsx, src/components/steamdeck/SteamDeckPage.tsx | /api/fleet/handheld/steamdeck_get_battery (host-local, feature-flagged) | not ported |
| `steamdeck_get_thermal` | src-tauri/src/commands/mod.rs:2261 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx, src/components/steamdeck/SteamDeckPage.test.tsx, src/components/steamdeck/SteamDeckPage.tsx | /api/fleet/handheld/steamdeck_get_thermal (host-local, feature-flagged) | not ported |
| `steamdeck_get_disk` | src-tauri/src/commands/mod.rs:2271 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx, src/components/steamdeck/SteamDeckPage.test.tsx, src/components/steamdeck/SteamDeckPage.tsx | /api/fleet/handheld/steamdeck_get_disk (host-local, feature-flagged) | not ported |
| `steamdeck_get_network` | src-tauri/src/commands/mod.rs:2281 | src/components/steamdeck/SteamDeckPage.test.tsx, src/components/steamdeck/SteamDeckPage.tsx | /api/fleet/handheld/steamdeck_get_network (host-local, feature-flagged) | not ported |
| `steamdeck_get_gpu` | src-tauri/src/commands/mod.rs:2291 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx, src/components/steamdeck/SteamDeckPage.test.tsx, src/components/steamdeck/SteamDeckPage.tsx | /api/fleet/handheld/steamdeck_get_gpu (host-local, feature-flagged) | not ported |
| `steamdeck_launch_rustdesk` | src-tauri/src/commands/mod.rs:2301 | src/components/steamdeck/SteamDeckPage.test.tsx, src/components/steamdeck/SteamDeckPage.tsx | /api/fleet/handheld/steamdeck_launch_rustdesk (host-local, feature-flagged) | not ported |
| `steamdeck_get_deskflow_status` | src-tauri/src/commands/mod.rs:2373 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx, src/components/steamdeck/SteamDeckPage.test.tsx, src/components/steamdeck/SteamDeckPage.tsx | /api/fleet/handheld/steamdeck_get_deskflow_status (host-local, feature-flagged) | not ported |
| `ally_provision` | src-tauri/src/commands/mod.rs:2389 | src/components/steamdeck/SteamDeckPage.test.tsx, src/components/steamdeck/SteamDeckPage.tsx | /api/fleet/handheld/ally_provision (host-local, feature-flagged) | not ported |
| `ally_launch_agent` | src-tauri/src/commands/mod.rs:2431 | src/components/steamdeck/SteamDeckPage.test.tsx, src/components/steamdeck/SteamDeckPage.tsx | /api/fleet/handheld/ally_launch_agent (host-local, feature-flagged) | not ported |

## Local 'This System'

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `get_local_system_stats` | src-tauri/src/commands/mod.rs:1186 | src/App.test.tsx, src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx, src/hooks/index.ts | /api/fleet/local/stats (host-only) | ported |

## REST services (Plex + generic)

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `get_rest_service_health` | src-tauri/src/commands/mod.rs:2571 | — | /api/fleet/rest/health | ported |
| `get_plex_identity` | src-tauri/src/commands/mod.rs:2596 | — | /api/fleet/rest/plex/identity | ported |
| `get_plex_libraries` | src-tauri/src/commands/mod.rs:2614 | — | /api/fleet/rest/plex/libraries | ported |

## MeshCentral

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `meshcentral_list_devices` | src-tauri/src/commands/mod.rs:2683 | src/pages/MeshCentralPage.test.tsx, src/pages/MeshCentralPage.tsx | /api/fleet/meshcentral/list_devices | not ported |
| `meshcentral_get_device_status` | src-tauri/src/commands/mod.rs:2690 | — | /api/fleet/meshcentral/get_device_status | not ported |
| `meshcentral_execute_batch` | src-tauri/src/commands/mod.rs:2699 | src/pages/MeshCentralPage.test.tsx, src/pages/MeshCentralPage.tsx | /api/fleet/meshcentral/execute_batch | not ported |
| `meshcentral_get_terminal_url` | src-tauri/src/commands/mod.rs:2711 | src/pages/DevicePage.test.tsx, src/pages/DevicePage.tsx, src/pages/MeshCentralPage.test.tsx, src/pages/MeshCentralPage.tsx | /api/fleet/meshcentral/get_terminal_url | not ported |
| `meshcentral_get_file_manager_url` | src-tauri/src/commands/mod.rs:2720 | src/pages/DevicePage.test.tsx, src/pages/DevicePage.tsx, src/pages/MeshCentralPage.test.tsx, src/pages/MeshCentralPage.tsx | /api/fleet/meshcentral/get_file_manager_url | not ported |
| `meshcentral_get_enrollment_info` | src-tauri/src/commands/mod.rs:2729 | src/pages/MeshCentralPage.test.tsx, src/pages/MeshCentralPage.tsx | /api/fleet/meshcentral/get_enrollment_info | not ported |
| `meshcentral_sync_fleet` | src-tauri/src/commands/mod.rs:2738 | src/pages/MeshCentralPage.test.tsx, src/pages/MeshCentralPage.tsx, src/pages/SettingsPage.test.tsx, src/pages/SettingsPage.tsx | /api/fleet/meshcentral/sync_fleet | not ported |
| `meshcentral_get_fleet_stats` | src-tauri/src/commands/mod.rs:2766 | src/App.test.tsx, src/hooks/index.ts, src/lib/tauri-commands.test.ts, src/pages/SettingsPage.test.tsx, src/pages/SettingsPage.tsx | /api/fleet/meshcentral/get_fleet_stats | not ported |
| `meshcentral_shell_exec` | src-tauri/src/commands/mod.rs:2815 | — | /api/fleet/meshcentral/shell_exec | not ported |
| `meshcentral_shell_batch` | src-tauri/src/commands/mod.rs:2828 | — | /api/fleet/meshcentral/shell_batch | not ported |
| `meshcentral_shell_fleet` | src-tauri/src/commands/mod.rs:2842 | src/pages/CompliancePage.test.tsx, src/pages/CompliancePage.tsx, src/pages/DashboardPage.test.tsx, src/pages/DashboardPage.tsx, src/pages/FleetCommandPage.test.tsx, src/pages/FleetCommandPage.tsx, src/pages/ServicePage.test.tsx | /api/fleet/meshcentral/shell_fleet | not ported |
| `meshcentral_read_file` | src-tauri/src/commands/mod.rs:2861 | — | /api/fleet/meshcentral/read_file | not ported |
| `meshcentral_write_file` | src-tauri/src/commands/mod.rs:2873 | — | /api/fleet/meshcentral/write_file | not ported |
| `meshcentral_list_dir` | src-tauri/src/commands/mod.rs:2887 | — | /api/fleet/meshcentral/list_dir | not ported |
| `meshcentral_get_system_stats` | src-tauri/src/commands/mod.rs:2899 | src/App.test.tsx, src/hooks/index.ts, src/lib/tauri-commands.test.ts, src/pages/DevicePage.test.tsx, src/pages/DevicePage.tsx | /api/fleet/meshcentral/get_system_stats | not ported |
| `meshcentral_get_processes` | src-tauri/src/commands/mod.rs:2910 | src/pages/DevicePage.test.tsx, src/pages/DevicePage.tsx | /api/fleet/meshcentral/get_processes | not ported |
| `meshcentral_reboot` | src-tauri/src/commands/mod.rs:2922 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx, src/components/layout/CommandPalette.tsx, src/pages/DevicePage.test.tsx, src/pages/DevicePage.tsx | /api/fleet/meshcentral/reboot | not ported |
| `meshcentral_shutdown` | src-tauri/src/commands/mod.rs:2936 | src/components/dashboard/Dashboard.test.tsx, src/components/dashboard/Dashboard.tsx, src/components/layout/CommandPalette.tsx, src/pages/DevicePage.test.tsx, src/pages/DevicePage.tsx | /api/fleet/meshcentral/shutdown | not ported |
| `meshcentral_docker_containers` | src-tauri/src/commands/mod.rs:2950 | — | /api/fleet/meshcentral/docker_containers | not ported |
| `meshcentral_docker_start` | src-tauri/src/commands/mod.rs:2961 | — | /api/fleet/meshcentral/docker_start | not ported |
| `meshcentral_docker_stop` | src-tauri/src/commands/mod.rs:2974 | — | /api/fleet/meshcentral/docker_stop | not ported |
| `meshcentral_docker_restart` | src-tauri/src/commands/mod.rs:2987 | — | /api/fleet/meshcentral/docker_restart | not ported |

## Alert Center

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `alert_create` | src-tauri/src/commands/mod.rs:3075 | src/pages/DashboardPage.test.tsx, src/pages/DashboardPage.tsx | /api/fleet/alerts/create | not ported |
| `alert_list` | src-tauri/src/commands/mod.rs:3108 | src/components/alerts/AlertCenter.test.tsx, src/components/alerts/AlertCenter.tsx, src/components/layout/TopBar.test.tsx, src/components/layout/TopBar.tsx, src/pages/DashboardPage.test.tsx, src/pages/DashboardPage.tsx | /api/fleet/alerts/list | not ported |
| `alert_acknowledge` | src-tauri/src/commands/mod.rs:3166 | src/components/alerts/AlertCenter.test.tsx, src/components/alerts/AlertCenter.tsx, src/components/layout/TopBar.test.tsx, src/components/layout/TopBar.tsx | /api/fleet/alerts/acknowledge | not ported |
| `alert_acknowledge_all` | src-tauri/src/commands/mod.rs:3177 | src/components/alerts/AlertCenter.test.tsx, src/components/alerts/AlertCenter.tsx, src/components/layout/TopBar.test.tsx, src/components/layout/TopBar.tsx | /api/fleet/alerts/acknowledge_all | not ported |
| `alert_get` | src-tauri/src/commands/mod.rs:3191 | — | /api/fleet/alerts/get | not ported |
| `alert_delete` | src-tauri/src/commands/mod.rs:3216 | src/components/alerts/AlertCenter.test.tsx, src/components/alerts/AlertCenter.tsx | /api/fleet/alerts/delete | not ported |
| `alert_auto_ack_run` | src-tauri/src/commands/mod.rs:3224 | — | /api/fleet/alerts/auto_ack_run | not ported |

## Historical metrics

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `metric_record` | src-tauri/src/commands/mod.rs:3311 | — | /api/fleet/metrics/record | not ported |
| `metric_query` | src-tauri/src/commands/mod.rs:3321 | — | /api/fleet/metrics/query | not ported |
| `metric_query_multi` | src-tauri/src/commands/mod.rs:3340 | src/components/charts/HistoricalCharts.tsx | /api/fleet/metrics/query_multi | not ported |
| `metric_collect_all` | src-tauri/src/commands/mod.rs:3367 | src/App.test.tsx, src/App.tsx | /api/fleet/metrics/collect_all | not ported |

## Prometheus polling

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `prom_query_range` | src-tauri/src/commands/mod.rs:3420 | src/components/charts/HistoricalCharts.tsx | /api/fleet/prometheus/query_range | not ported |
| `prometheus_health` | src-tauri/src/commands/mod.rs:3488 | src/components/charts/HistoricalCharts.tsx | /api/fleet/prometheus/health | not ported |
| `poll_prometheus_alerts` | src-tauri/src/commands/mod.rs:3554 | — | /api/fleet/alerts/poll/prometheus_alerts | not ported |
| `poll_meshcentral_status_changes` | src-tauri/src/commands/mod.rs:3735 | — | /api/fleet/alerts/poll/meshcentral_status_changes | not ported |
| `poll_all_alert_sources` | src-tauri/src/commands/mod.rs:3745 | src/App.test.tsx, src/App.tsx | /api/fleet/alerts/poll/all_alert_sources | not ported |

## Embedded terminal

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `terminal_write` | src-tauri/src/commands/terminal.rs:89 | src/components/terminal/EmbeddedTerminal.tsx | /ws/pty/{profile} (websocket PTY) | not ported |
| `terminal_resize` | src-tauri/src/commands/terminal.rs:106 | src/components/terminal/EmbeddedTerminal.tsx | /ws/pty/{profile} (websocket PTY) | not ported |
| `terminal_close` | src-tauri/src/commands/terminal.rs:125 | src/components/terminal/EmbeddedTerminal.tsx | /ws/pty/{profile} (websocket PTY) | not ported |

## OpenCode / Hermes chat

| Command | Rust handler | UI files | Target route | Status |
|---|---|---|---|---|
| `opencode_start` | src-tauri/src/commands/opencode_chat.rs:57 | src/components/opencode/ChatPanel.test.tsx, src/components/opencode/ChatPanel.tsx, src/pages/ChatPage.test.tsx | n/a — Hermes sidecar wrapper (no /api/fleet route) | not ported |
| `opencode_stop` | src-tauri/src/commands/opencode_chat.rs:132 | src/components/opencode/ChatPanel.test.tsx, src/components/opencode/ChatPanel.tsx, src/pages/ChatPage.test.tsx | n/a — Hermes sidecar wrapper (no /api/fleet route) | not ported |
| `opencode_status` | src-tauri/src/commands/opencode_chat.rs:152 | src/components/opencode/ChatPanel.test.tsx, src/components/opencode/ChatPanel.tsx, src/pages/ChatPage.test.tsx | n/a — Hermes sidecar wrapper (no /api/fleet route) | not ported |
| `opencode_new_session` | src-tauri/src/commands/opencode_chat.rs:195 | src/components/opencode/ChatPanel.test.tsx, src/components/opencode/ChatPanel.tsx, src/pages/ChatPage.test.tsx | n/a — Hermes sidecar wrapper (no /api/fleet route) | not ported |
| `opencode_send_message` | src-tauri/src/commands/opencode_chat.rs:230 | src/components/opencode/ChatPanel.test.tsx, src/components/opencode/ChatPanel.tsx, src/pages/ChatPage.test.tsx | n/a — Hermes sidecar wrapper (no /api/fleet route) | not ported |
| `opencode_get_history` | src-tauri/src/commands/opencode_chat.rs:266 | src/components/opencode/ChatPanel.test.tsx, src/components/opencode/ChatPanel.tsx, src/pages/ChatPage.test.tsx | n/a — Hermes sidecar wrapper (no /api/fleet route) | not ported |
| `opencode_abort` | src-tauri/src/commands/opencode_chat.rs:294 | src/components/opencode/ChatPanel.test.tsx, src/components/opencode/ChatPanel.tsx, src/pages/ChatPage.test.tsx | n/a — Hermes sidecar wrapper (no /api/fleet route) | not ported |

