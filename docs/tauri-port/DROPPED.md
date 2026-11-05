# Dropped Tauri commands — docs/tauri-port/DROPPED.md

Commands from the 172-command Tauri inventory (docs/tauri-port/COMMANDS.md) that
are **dropped**: not ported to the FastAPI backend, with no plan to implement
them in the web-server MVP. Grouped by area below. Every row was marked
"dropped — host-local feature-flagged module (P14)" in COMMANDS.md (queue task
C2); none of them are implemented, none are wired to src/lib/fleet-api.ts, and
none will be implemented as part of this port.

## Rule

These are P14 host-local feature-flagged modules: phone ADB, KDE Connect, and
Steam Deck / handheld tooling. They only work when the backend runs on the
machine that has `adb`, `kdeconnect-cli`, or the handheld's tooling installed,
so they are out of scope for a web server that runs anywhere in the tailnet. The
owner can revisit them per group. Ported host-local rows (get_phone_device_info,
get_phone_battery, get_kdeconnect_battery, kdeconnect_list_devices) stay in
COMMANDS.md as ported and are deliberately not listed here.

## Phone (host-local, P14) — 23 commands

| Command | Reason |
|---|---|
| `get_phone_thermal` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `get_phone_cpu` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `get_phone_screen` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `get_phone_network` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `get_phone_apps` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `get_phone_processes` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `get_phone_activity` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_set_screen` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_set_brightness` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_set_auto_brightness` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_volume_up` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_volume_down` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_reboot` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_screenshot` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_screenshot_save` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_force_stop_app` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_get_sms_inbox` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_get_sms_by_address` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_get_sms_conversations` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_send_sms` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `launch_rustdesk` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_get_contacts` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `phone_get_call_log` | Host-local ADB module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |

## KDE Connect (host-local, P14) — 23 commands

| Command | Reason |
|---|---|
| `get_kdeconnect_notifications` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `get_kdeconnect_notification` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `get_kdeconnect_mpris` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_mpris_play` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_mpris_pause` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_mpris_play_pause` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_mpris_next` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_mpris_previous` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_mpris_set_volume` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `get_kdeconnect_telephony` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_ring_device` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_send_ping` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_send_sms` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_send_clipboard` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_get_clipboard` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `get_kdeconnect_contacts` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_sftp_list` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_share_file` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_share_url` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_share_text` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_get_conversations` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_reply_conversation` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `kdeconnect_request_conversation` | Host-local KDE Connect module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |

## Steam Deck / handheld (host-local, P14) — 10 commands

| Command | Reason |
|---|---|
| `steamdeck_get_system_stats` | Host-local handheld module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `steamdeck_get_battery` | Host-local handheld module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `steamdeck_get_thermal` | Host-local handheld module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `steamdeck_get_disk` | Host-local handheld module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `steamdeck_get_network` | Host-local handheld module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `steamdeck_get_gpu` | Host-local handheld module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `steamdeck_launch_rustdesk` | Host-local handheld module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `steamdeck_get_deskflow_status` | Host-local handheld module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `ally_provision` | Host-local handheld module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
| `ally_launch_agent` | Host-local handheld module (P14) — not part of the web-server MVP; reports cleanly when unavailable. |
