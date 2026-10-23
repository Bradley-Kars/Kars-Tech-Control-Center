import { useState } from 'react';
import type { ServerConfig } from '../../lib/types';
import { testConnection } from '../../lib/tauri-commands';

interface Props {
  onConnect: (config: ServerConfig) => void;
}

export function ConnectionScreen({ onConnect }: Props) {
  const [deviceType, setDeviceType] = useState<'unraid' | 'phone' | 'steamdeck'>('unraid');
  const [hostname, setHostname] = useState('home-server.tailf6d3b4.ts.net');
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [name, setName] = useState('Slayers Server');
  const [adbSerial, setAdbSerial] = useState('');
  const [kdeConnectDeviceId, setKdeConnectDeviceId] = useState('');
  const [rustdeskId, setRustdeskId] = useState('');
  const [rustdeskPassword, setRustdeskPassword] = useState('');
  const [steamdeckRustdeskId, setSteamdeckRustdeskId] = useState('');
  const [steamdeckRustdeskPassword, setSteamdeckRustdeskPassword] = useState('');
  const [steamdeckKdeconnectDeviceId, setSteamdeckKdeconnectDeviceId] = useState('');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setError('');
    try {
      const config: ServerConfig = {
        id: 'temp', name: name || hostname, hostname, port, username,
        auth: { type: 'password', password },
        device_type: deviceType,
        api_key: apiKey || undefined,
        service_keys: deviceType === 'phone' ? {
          phone_adb_serial: adbSerial || undefined,
          kdeconnect_device_id: kdeConnectDeviceId || undefined,
          phone_rustdesk_id: rustdeskId || undefined,
          phone_rustdesk_password: rustdeskPassword || undefined,
        } : deviceType === 'steamdeck' ? {
          steamdeck_rustdesk_id: steamdeckRustdeskId || undefined,
          steamdeck_rustdesk_password: steamdeckRustdeskPassword || undefined,
          steamdeck_kdeconnect_device_id: steamdeckKdeconnectDeviceId || undefined,
        } : {
          adguard_user: undefined,
          adguard_pass: undefined,
          adguard_url: undefined,
          lidarr_api_key: undefined,
          homeassistant_token: undefined,
          myspeed_db_path: undefined,
          myspeed_url: undefined,
          nextcloud_user: undefined,
          nextcloud_pass: undefined,
        },
      };
      const result = await testConnection(config);
      if (result.success) alert('Connected: ' + result.message);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = () => {
    if (!hostname || !password) { setError('Hostname and password required'); return; }
    onConnect({
      id: `server-${Date.now()}`, name: name || hostname.split('.')[0],
      hostname, port, username,
      auth: { type: 'password', password }, device_type: deviceType,
      api_key: apiKey || undefined,
      service_keys: deviceType === 'phone' ? {
        phone_adb_serial: adbSerial || undefined,
        kdeconnect_device_id: kdeConnectDeviceId || undefined,
        phone_rustdesk_id: rustdeskId || undefined,
        phone_rustdesk_password: rustdeskPassword || undefined,
      } : deviceType === 'steamdeck' ? {
        steamdeck_rustdesk_id: steamdeckRustdeskId || undefined,
        steamdeck_rustdesk_password: steamdeckRustdeskPassword || undefined,
        steamdeck_kdeconnect_device_id: steamdeckKdeconnectDeviceId || undefined,
      } : {},
    });
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal to-teal-dim flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 12h4l2-7 4 14 2-7h6" stroke="#0A1628" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-heading font-bold">KTS Master Control</h1>
            <p className="text-xs text-muted font-mono">Connect to your server</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1.5 font-mono">Device Type</label>
            <select
              value={deviceType}
              onChange={e => { setDeviceType(e.target.value as 'unraid' | 'phone' | 'steamdeck'); setPort(e.target.value === 'phone' ? 5555 : 22); }}
              className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-off focus:border-teal focus:outline-none appearance-none"
            >
              <option value="unraid">Unraid Server</option>
              <option value="phone">Phone (Android)</option>
              <option value="steamdeck">Steam Deck / ROG Ally (Bazzite)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5 font-mono">Server Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Slayers Server"
              className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-off focus:border-teal focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5 font-mono">Hostname (Tailscale DNS)</label>
            <input value={hostname} onChange={e => setHostname(e.target.value)} placeholder="home-server.tailnet.ts.net"
              className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-off font-mono focus:border-teal focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1.5 font-mono">Port</label>
              <input
                type="number"
                value={port}
                onChange={e => setPort(Number(e.target.value))}
                className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-off font-mono focus:border-teal focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5 font-mono">Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)}
                className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-off focus:border-teal focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5 font-mono">SSH Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-off focus:border-teal focus:outline-none" />
          </div>

          {deviceType === 'unraid' && (
            <div>
              <label className="block text-xs text-muted mb-1.5 font-mono">Unraid API Key (optional)</label>
              <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="For structured data access"
                className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-off font-mono focus:border-teal focus:outline-none" />
            </div>
          )}

          {deviceType === 'phone' && (
            <div className="space-y-4 pt-2 border-t border-line">
              <div>
                <label className="block text-xs text-muted mb-1.5 font-mono">ADB Serial (optional)</label>
                <input value={adbSerial} onChange={e => setAdbSerial(e.target.value)} placeholder="e.g. b-s24-ultra.tailf6d3b4.ts.net:36887"
                  className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-off font-mono focus:border-teal focus:outline-none" />
                <p className="text-xs text-muted mt-1">Leave empty to use hostname:port</p>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5 font-mono">KDE Connect Device ID (optional)</label>
                <input value={kdeConnectDeviceId} onChange={e => setKdeConnectDeviceId(e.target.value)} placeholder="e.g. 7cc37f37453c42f2b5713a505ec547c1"
                  className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-off font-mono focus:border-teal focus:outline-none" />
                <p className="text-xs text-muted mt-1">Found in KDE Connect app on phone</p>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5 font-mono">RustDesk ID (optional)</label>
                <input value={rustdeskId} onChange={e => setRustdeskId(e.target.value)} placeholder="e.g. 1321035736"
                  className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-off font-mono focus:border-teal focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5 font-mono">RustDesk Password (optional)</label>
                <input type="password" value={rustdeskPassword} onChange={e => setRustdeskPassword(e.target.value)}
                  className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-off focus:border-teal focus:outline-none" />
              </div>
            </div>
          )}

          {deviceType === 'steamdeck' && (
            <div className="space-y-4 pt-2 border-t border-line">
              <div>
                <label className="block text-xs text-muted mb-1.5 font-mono">KDE Connect Device ID (optional)</label>
                <input value={steamdeckKdeconnectDeviceId} onChange={e => setSteamdeckKdeconnectDeviceId(e.target.value)} placeholder="e.g. abc123... (from kdeconnect-cli -l)"
                  className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-off font-mono focus:border-teal focus:outline-none" />
                <p className="text-xs text-muted mt-1">Run: kdeconnect-cli -l on the Ally</p>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5 font-mono">RustDesk ID (optional)</label>
                <input value={steamdeckRustdeskId} onChange={e => setSteamdeckRustdeskId(e.target.value)} placeholder="e.g. 2306695"
                  className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-off font-mono focus:border-teal focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5 font-mono">RustDesk Password (optional)</label>
                <input type="password" value={steamdeckRustdeskPassword} onChange={e => setSteamdeckRustdeskPassword(e.target.value)}
                  className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-off focus:border-teal focus:outline-none" />
              </div>
              <div className="bg-teal/10 border border-teal/20 rounded-lg p-3">
                <p className="text-xs text-teal font-mono">🎮 Deskflow: Connected (KVM)</p>
                <p className="text-xs text-muted mt-1">Keyboard/mouse shared via Deskflow</p>
              </div>
            </div>
          )}
        </div>

        {error && <div className="mt-4 text-sm text-red bg-red/10 border border-red/20 rounded-lg px-3 py-2">{error}</div>}

        <div className="flex gap-3 mt-6">
          <button onClick={handleTest} disabled={testing}
            className="btn btn-ghost flex-1 disabled:opacity-50">
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <button onClick={handleConnect} className="btn btn-primary flex-1">Connect</button>
        </div>
      </div>
    </div>
  );
}
