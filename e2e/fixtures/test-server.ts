export const testServer = {
  id: 'test-server-1',
  name: 'Test Unraid Server',
  hostname: '<device>.<tailnet>.ts.net',
  username: 'root',
  auth: { password: 'test-password' },
  api_key: 'test-api-key-123',
  service_keys: {
    nextcloud_user: '<user>',
    nextcloud_pass: 'test-nc-pass',
    lidarr_api_key: 'test-lidarr-key',
    homeassistant_token: 'test-ha-token',
    myspeed_db_path: '/mnt/user/appdata/myspeed/storage.db',
    myspeed_url: 'http://localhost:5216',
    adguard_user: '<user>',
    adguard_pass: 'test-adguard-pass',
    adguard_url: 'https://adguard.<tailnet>.ts.net:8443',
  },
};