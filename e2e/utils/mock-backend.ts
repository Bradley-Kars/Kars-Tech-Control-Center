import type { Page } from '@playwright/test';

export async function mockAllTauriCommands(page: Page) {
  await page.addInitScript(() => {
    const mockData: Record<string, unknown> = {
      get_servers: [
        { id: 'test-server-1', name: 'Test Server', hostname: 'home-server.tailf6d3b4.ts.net', username: 'root', auth: { password: 'test' }, api_key: 'test-key', device_type: 'unraid', service_keys: { nextcloud_user: 'slayerbrk', nextcloud_pass: 'pass', lidarr_api_key: 'key', homeassistant_token: 'token', myspeed_db_path: '/tmp/test.db', myspeed_url: 'http://localhost:5216', adguard_user: 'slayerbrk', adguard_pass: 'pass', adguard_url: 'https://adguard.tailf6d3b4.ts.net:8443' } },
        { id: 'test-phone-1', name: 'Galaxy S24', hostname: 'b-s24-ultra.tailf6d3b4.ts.net', username: 'root', auth: { password: 'test' }, device_type: 'phone', service_keys: { phone_adb_serial: 'b-s24-ultra.tailf6d3b4.ts.net:36887', kdeconnect_device_id: '7cc37f37453c42f2b5713a505ec547c1', phone_rustdesk_id: '1321035736' } },
        { id: 'test-steamdeck-1', name: 'ROG Ally', hostname: 'lgbtally.tailf6d3b4.ts.net', username: 'LGBT_Ally', auth: { password: 'test-pass' }, device_type: 'steamdeck', service_keys: { steamdeck_rustdesk_id: '2306695', steamdeck_rustdesk_password: 'test-pass', steamdeck_kdeconnect_device_id: 'ally-device-id' } }
      ],
      get_system_stats: { hostname: 'home-server', kernel: '6.18.38-Unraid', os_release: '6.18.38-Unraid', arch: 'x86_64', uptime: '2024-01-15T10:30:00Z', cpu_usage: 28.9, cpu_cores: 6, cpu_threads: 12, cpu_brand: 'Intel Core i7-8700K', cpu_speed: 3.7, memory_total_mb: 16384, memory_used_mb: 12123, memory_free_mb: 4261, memory_usage_pct: 74.0, memory_total_bytes: 17179869184, memory_used_bytes: 12713275392, swap_total: 0, swap_used: 0, timezone: 'America/Chicago', temp_avg: 45.0, temp_hottest: 'coretemp', temp_hottest_value: 52.0, sensors: [], array_state: 'STARTED', system_manufacturer: 'OEM', system_model: 'Server' },
      get_docker_containers: [
        { id: 'abc123', name: 'nextcloud', image: 'linuxserver/nextcloud', state: 'running', status: 'Up 2 weeks', autoStart: true },
        { id: 'def456', name: 'lidarr', image: 'linuxserver/lidarr', state: 'running', status: 'Up 2 weeks', autoStart: true },
        { id: 'ghi789', name: 'homeassistant', image: 'home-assistant', state: 'running', status: 'Up 2 weeks', autoStart: true },
        { id: 'jkl012', name: 'adguard', image: 'adguard', state: 'running', status: 'Up 2 weeks', autoStart: true },
        { id: 'mno345', name: 'plex', image: 'plex', state: 'running', status: 'Up 2 weeks', autoStart: true },
        { id: 'pqr678', name: 'radarr', image: 'linuxserver/radarr', state: 'stopped', status: 'Exited', autoStart: true },
      ],
      get_gpu_info: { name: 'NVIDIA GeForce GTX 1080 Ti', temperature: '35', utilization: '12', memory_used: '1542', memory_total: '11264', power_usage: '67', power_cap: '280', driver_version: '560.35.03', cuda_version: '12.6' },
      get_disks: [
        { name: 'sda', device: '/dev/sda', type: 'SSD', size: 500107862016, vendor: 'Samsung', temperature: 32, smartStatus: 'PASSED', isSpinning: false },
        { name: 'sdb', device: '/dev/sdb', type: 'HDD', size: 8001563222016, vendor: 'WD', temperature: 35, smartStatus: 'PASSED', isSpinning: true },
      ],
      get_shares: [
        { name: 'appdata', comment: 'Appdata', allocator: 'mover', cache: 'Yes', size: 107374182400, free: 32212254720, used: 75161927680 },
        { name: 'media', comment: 'Media', allocator: 'mover', cache: 'No', size: 1099511627776, free: 549755813888, used: 549755813888 },
      ],
      get_adguard_status: { version: 'v0.107.79', protection_enabled: true, running: true, dns_addresses: ['192.168.1.100'], dns_port: 53, http_port: 8443 },
      get_adguard_stats: { dns_queries: { total: 3084491, blocked: 384155, replaced: 12000, safe_browsing: 500, parental: 200, avg_processing_time: 15.5 }, blocked: { domains: 125000, clients: 5 }, replaced: { domains: 1500, clients: 3 }, clients: { total: 5, active: 3 }, filters: { total: 27, enabled: 24 } },
      get_adguard_query_log: { activities: Array.from({ length: 50 }, (_, i) => ({ filterId: i % 5 === 0 ? 1777159247 : null, elapsedMs: '15.5', cached: false, client: `192.168.4.${100 + (i % 20)}`, client_info: { name: 'TestClient', whois: {}, disallowed_rule: '', disallowed: false }, client_proto: '', reason: i % 4 === 0 ? 'FilteredBlackList' : 'NotFilteredNotFound', rule: null, rules: [], status: 'NOERROR', time: new Date(Date.now() - i * 60000).toISOString(), upstream: 'quic://dns.quad9.net:853', answer: [{ type: 'A', value: '93.184.216.1', ttl: 3600 }], answer_dnssec: false, question: { type: 'A', name: `example${i}.com`, class: 'IN' } })), limit: 50, offset: 0, total: 3084491 },
      get_adguard_clients: { clients: [{ name: 'Ophelia', ids: ['192.168.4.127'], filtering_enabled: true, parental_enabled: false, safe_search_enabled: false, safe_browsing_enabled: false, use_global_settings: true }, { name: 'IoT', ids: ['192.168.4.69'], filtering_enabled: true, parental_enabled: false, safe_search_enabled: false, safe_browsing_enabled: false, use_global_settings: true }] },
      get_adguard_filters: [{ id: 1, enabled: true, name: 'AdGuard DNS filter', rules_count: 49360 }, { id: 2, enabled: true, name: 'AdGuard Base filter', rules_count: 157204 }],
      get_nextcloud_info: { installed: true, maintenance: false, version: '34.0.3.2', edition: 'Community' },
      get_nextcloud_status: { installed: true, maintenance: false, version: '34.0.3.2', edition: 'Community' },
      get_nextcloud_storage: { num_users: 3, num_files: 60509, num_storages: 4, num_storages_local: 1, num_storages_home: 3, num_storages_other: 0 },
      get_nextcloud_users: [{ id: 'slayerbrk', displayname: 'slayerbrk', enabled: true }, { id: 'admin', displayname: 'Admin', enabled: true }],
      get_nextcloud_activity: { activities: [{ app: 'files', subject: 'You created "test.txt"', timestamp: 1724000000, type: 'file', user: 'slayerbrk' }] },
      get_lidarr_status: { version: '3.1.0.4875', instanceName: 'Lidarr' },
      get_homeassistant_states: [{ entity_id: 'light.living_room', state: 'on', attributes: { friendly_name: 'Living Room Light' } }, { entity_id: 'switch.kitchen', state: 'off', attributes: { friendly_name: 'Kitchen Switch' } }],
      get_myspeed_summary: { stats: { total_tests: 935, avg_download: 201.2, avg_upload: 95.8, avg_ping: 12.3 }, tests: [{ id: 1, download: 215.3, upload: 98.2, ping: 11.5, testServer: 'Chicago, IL', testDate: '2024-08-25T12:00:00Z' }] },
      test_connection: { success: true, message: 'Connected', hostname: 'home-server', os: 'Unraid', services: { graphql: true, nextcloud: true, lidarr: true, homeassistant: true, myspeed: true, adguard: true } },
      get_processes: 'root 1234 0.5 1.2 /usr/bin/foo',
      get_syslog: 'Aug 26 00:00:00 server kernel: test',
      get_plugins: ['plugin1', 'plugin2', 'plugin3'],
      get_network_interfaces: 'eth0 UP 192.168.1.100/24',
      get_tailscale_peers: '100.103.29.63 home-server',
      get_array_info: { state: 'STARTED', capacity: { disks: { free: 1000000000, used: 5000000000, total: 6000000000 } }, disks: [], caches: [] },
      get_user_scripts: 'backup.sh\ncleanup.sh',
      save_server: {},
      remove_server: {},
      docker_start: 'Started',
      docker_stop: 'Stopped',
      docker_restart: 'Restarted',
      docker_logs: 'Log line 1\nLog line 2',
      docker_remove: 'Removed',
      adguard_enable: {},
      adguard_disable: {},
      homeassistant_toggle: {},
      homeassistant_turn_on: {},
      homeassistant_turn_off: {},
      // Phone commands
      get_phone_device_info: { model: 'SM-S928U', android_version: '16', api_level: '36', serial: 'R5CT10XXXXX', manufacturer: 'Samsung', brand: 'Samsung', build_fingerprint: 'samsung/samsung' },
      get_phone_battery: { level: 85, status: '2', health: 'Good', temperature: 28.5, voltage: 4200, technology: 'Li-ion', charging: true, plugged: 'AC', current_ua: 1500000 },
      get_phone_storage: { total_gb: 256, used_gb: 128, free_gb: 128, usage_pct: 50 },
      get_phone_memory: { total_mb: 12288, available_mb: 6144, used_mb: 6144, usage_pct: 50 },
      get_phone_screen: { on: true, brightness: 128, auto_brightness: true },
      get_phone_network: { wifi_ssid: 'HomeNetwork', wifi_ip: '192.168.4.127', wifi_signal: -45, cellular_type: '5G', cellular_level: 3 },
      get_phone_activity: { package: 'com.android.chrome', activity: 'BrowserActivity' },
      phone_set_screen: {},
      phone_set_brightness: {},
      phone_set_auto_brightness: {},
      phone_volume_up: {},
      phone_volume_down: {},
      phone_reboot: {},
      phone_screenshot: [],
      phone_force_stop_app: {},
      phone_get_sms_inbox: [],
      phone_get_sms_by_address: [],
      phone_get_sms_conversations: [],
      phone_send_sms: {},
      phone_get_contacts: [
        { id: 1, display_name: 'Alice', phone_numbers: ['+15551234567'] },
        { id: 2, display_name: 'Bob', phone_numbers: ['+15559876543', '+15551112222'] },
      ],
      phone_get_call_log: [
        { id: 1, number: '+15551234567', name: 'Alice', type_: 'Incoming', date: 1724000000000, duration: 120 },
        { id: 2, number: '+15559876543', name: null, type_: 'Missed', date: 1724000600000, duration: 0 },
      ],
      launch_rustdesk: {},
      // Steam Deck commands
      steamdeck_get_system_stats: { hostname: 'ROG-Ally', kernel: '6.12.0', os_release: 'Bazzite 41', arch: 'x86_64', uptime: '2h 30m', cpu_usage: 15.2, cpu_cores: 16, cpu_threads: 24, cpu_brand: 'AMD Ryzen Z1 Extreme', cpu_speed: 5.1, memory_total_mb: 32768, memory_used_mb: 8192, memory_free_mb: 24576, memory_usage_pct: 25.0, swap_total_mb: 0, swap_used_mb: 0, load_avg: [0.5, 0.3, 0.2], timezone: 'America/Chicago' },
      steamdeck_get_battery: { percentage: 78, charging: false, time_remaining: '4h 12m', capacity_wh: 40.0, energy_wh: 31.2, voltage_v: 11.4 },
      steamdeck_get_thermal: { cpu_temp_c: 52.3, gpu_temp_c: 48.7, fan_speed_rpm: 3200, fan_pwm: 65 },
      steamdeck_get_disk: { total_gb: 512.0, used_gb: 234.5, free_gb: 277.5, usage_pct: 45.8 },
      steamdeck_get_network: { interfaces: [{ name: 'wlan0', ip: '192.168.4.128', mac: 'AA:BB:CC:DD:EE:FF', rx_bytes: 1024000, tx_bytes: 512000, speed: '1441Mbps' }], default_route: '192.168.4.1', dns_servers: ['192.168.4.1', '8.8.8.8'] },
      steamdeck_get_gpu: { vendor: 'AMD', model: 'Radeon 780M', driver_version: '24.03.1', memory_total_mb: 8192, memory_used_mb: 2048, temperature_c: 48.7, utilization_pct: 23.5 },
      steamdeck_launch_rustdesk: {},
      steamdeck_get_deskflow_status: { connected: true },
      // KDE Connect commands
      get_kdeconnect_battery: { charge: 85, isCharging: true, hasBattery: true, iconName: 'battery-full-charged' },
      get_kdeconnect_notifications: [
        { id: '1', app_name: 'Messages', title: 'New message', text: 'Hey!', icon_name: null, urgency: 'normal', timestamp: 1724000000 },
        { id: '2', app_name: 'Gmail', title: 'New email', text: 'Meeting tomorrow', icon_name: null, urgency: 'normal', timestamp: 1724000100 },
      ],
      get_kdeconnect_notification: { id: '1', app_name: 'Messages', title: 'New message', text: 'Hey!', icon_name: null, urgency: 'normal', timestamp: 1724000000 },
      get_kdeconnect_mpris: { player: 'Spotify', player_list: ['Spotify'], title: 'Test Song', artist: 'Test Artist', album: 'Test Album', is_playing: true, can_seek: true, volume: 0.8, position: 120000, length: 240000, local_album_art_url: '' },
      kdeconnect_mpris_play: {},
      kdeconnect_mpris_pause: {},
      kdeconnect_mpris_play_pause: {},
      kdeconnect_mpris_next: {},
      kdeconnect_mpris_previous: {},
      kdeconnect_mpris_set_volume: {},
      get_kdeconnect_connectivity: { cellular_network_strength: 3, cellular_network_type: '5G', icon_name: 'network-cellular-5g' },
      get_kdeconnect_telephony: { is_ringing: false, is_active: false, number: null, name: null },
      kdeconnect_ring_device: {},
      kdeconnect_send_ping: {},
      kdeconnect_send_sms: {},
      kdeconnect_send_clipboard: {},
      kdeconnect_get_clipboard: 'clipboard text from phone',
      get_kdeconnect_contacts: [],
      kdeconnect_sftp_list: [
        { name: 'DCIM', path: '/storage/emulated/0/DCIM', is_dir: true, size: null, mime_type: null },
        { name: 'Documents', path: '/storage/emulated/0/Documents', is_dir: true, size: null, mime_type: null },
        { name: 'photo.jpg', path: '/storage/emulated/0/photo.jpg', is_dir: false, size: 2048000, mime_type: 'image/jpeg' },
      ],
      kdeconnect_share_file: {},
      kdeconnect_share_url: {},
      kdeconnect_share_text: {},
      kdeconnect_get_conversations: [
        { thread_id: 1, address: '+15551234567', body: 'See you at 7!', date: 1724000000, read: true, message_count: 15 },
        { thread_id: 2, address: '+15559876543', body: 'Thanks!', date: 1724000600, read: false, message_count: 3 },
      ],
      kdeconnect_reply_conversation: {},
      kdeconnect_request_conversation: {},
      kdeconnect_list_devices: [
        { id: '7cc37f37453c42f2b5713a505ec547c1', name: 'Galaxy S24 Ultra', device_type: 'phone', is_paired: true, is_reachable: true, icon_name: 'phone' },
        { id: '_091dfaa5_10ae_4034_af89_a1e0a0b3dd05_', name: 'LGBTAlly', device_type: 'desktop', is_paired: true, is_reachable: false, icon_name: 'laptopdisconnected' },
      ],
    };

    // @ts-ignore
    window.__TAURI_MOCK__ = mockData;

    // @tauri-apps/api/core uses window.__TAURI_INTERNALS__.invoke (NOT __TAURI__.core.invoke)
    // @ts-ignore
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        return mockData[cmd] ?? null;
      },
      transformCallback: (cb: any) => 0,
    };

    // Also define __TAURI__ for compatibility
    // @ts-ignore
    window.__TAURI__ = window.__TAURI__ || {};
    // @ts-ignore
    window.__TAURI__.core = {
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        return mockData[cmd] ?? null;
      },
    };
  });
}