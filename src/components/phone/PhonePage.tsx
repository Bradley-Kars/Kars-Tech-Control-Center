import { useState, useEffect, useCallback } from 'react';
import type { ServerConfig, SmsConversation, SmsMessage } from '../../lib/types';
import { 
  getPhoneDeviceInfo,
  getPhoneBattery,
  getPhoneThermal,
  getPhoneStorage,
  getPhoneMemory,
  getPhoneScreen,
  getPhoneNetwork,
  getPhoneActivity,
  getKdeConnectBattery,
  getKdeConnectNotifications,
  getKdeConnectMpris,
  kdeConnectMprisPlayPause,
  kdeConnectMprisNext,
  kdeConnectMprisPrevious,
  kdeConnectMprisSetVolume,
  kdeConnectRingDevice,
  kdeConnectSendPing,
  kdeConnectGetClipboard,
  getKdeConnectTelephony,
  kdeConnectShareUrl,
  kdeConnectShareText,
  phoneSetScreen,
  phoneVolumeUp,
  phoneVolumeDown,
  phoneReboot,
  phoneScreenshot,
  launchRustdesk,
  phoneGetSmsByAddress,
  phoneGetSmsConversations,
  kdeConnectSendSms,
  phoneGetCallLog,
  phoneGetContacts,
  kdeConnectSftpList,
} from '../../lib/tauri-commands';

interface Props {
  servers: ServerConfig[];
}

function GaugeRing({ value, color }: { value: number; label?: string; color: string }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#1E293B" strokeWidth="8" />
          <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel rounded-xl border border-line p-4">
      <h3 className="text-xs font-mono text-muted uppercase tracking-widest mb-3">{title}</h3>
      {children}
    </div>
  );
}

export function PhonePage({ servers }: Props) {
  const phoneServer = servers.find(s => s.device_type === 'phone');

  // Phone data
  const [phoneDevice, setPhoneDevice] = useState<any>(null);
  const [battery, setBattery] = useState<any>(null);
  const [phoneThermal, setPhoneThermal] = useState<any>(null);
  const [phoneStorage, setPhoneStorage] = useState<any>(null);
  const [phoneMemory, setPhoneMemory] = useState<any>(null);
  const [phoneScreen, setPhoneScreen] = useState<any>(null);
  const [phoneNetwork, setPhoneNetwork] = useState<any>(null);
  const [phoneActivity, setPhoneActivity] = useState<any>(null);
  
  // KDE Connect data
  const [kdeNotifications, setKdeNotifications] = useState<any[]>([]);
  const [kdeMpris, setKdeMpris] = useState<any>(null);
  const [kdeTelephony, setKdeTelephony] = useState<any>(null);
  const [kdeClipboard, setKdeClipboard] = useState<string>('');
  
  // SMS state
  const [smsConversations, setSmsConversations] = useState<SmsConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [smsMessages, setSmsMessages] = useState<SmsMessage[]>([]);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [newSmsNumber, setNewSmsNumber] = useState('');
  const [newSmsBody, setNewSmsBody] = useState('');

  // Call log state
  const [callLog, setCallLog] = useState<any[]>([]);

  // Contacts state
  const [contacts, setContacts] = useState<any[]>([]);

  // SFTP state
  const [sftpPath, setSftpPath] = useState('/');
  const [sftpFiles, setSftpFiles] = useState<any[]>([]);

  // Connection status
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [kdeConnected, setKdeConnected] = useState(false);

  const batteryLevel = battery?.level || 0;
  const batteryCharging = battery?.charging || false;

  const refreshPhone = useCallback(async () => {
    if (!phoneServer) return;
    try {
      const [dev, bat, therm, stor, mem, scr, net, act] = await Promise.allSettled([
        getPhoneDeviceInfo(phoneServer.id),
        getPhoneBattery(phoneServer.id),
        getPhoneThermal(phoneServer.id),
        getPhoneStorage(phoneServer.id),
        getPhoneMemory(phoneServer.id),
        getPhoneScreen(phoneServer.id),
        getPhoneNetwork(phoneServer.id),
        getPhoneActivity(phoneServer.id),
      ]);
      if (dev.status === 'fulfilled') setPhoneDevice(dev.value);
      if (bat.status === 'fulfilled') setBattery(bat.value);
      if (therm.status === 'fulfilled') setPhoneThermal(therm.value);
      if (stor.status === 'fulfilled') setPhoneStorage(stor.value);
      if (mem.status === 'fulfilled') setPhoneMemory(mem.value);
      if (scr.status === 'fulfilled') setPhoneScreen(scr.value);
      if (net.status === 'fulfilled') setPhoneNetwork(net.value);
      if (act.status === 'fulfilled') setPhoneActivity(act.value);
      // Honest badge: ADB is only "connected" when at least one probe returned.
      const anyAdb = [dev, bat, therm, stor, mem, scr, net, act].some(r => r.status === 'fulfilled');
      setPhoneConnected(anyAdb);
      const failed = [dev, bat, therm, stor, mem, scr, net, act].filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        console.error('Phone ADB probes failed:', failed.map(r => (r as PromiseRejectedResult).reason));
      }
    } catch (e) {
      console.error('Phone refresh failed:', e);
      setPhoneConnected(false);
    }

    try {
      const [bat, notif, mpris, tel] = await Promise.allSettled([
        getKdeConnectBattery(phoneServer.id),
        getKdeConnectNotifications(phoneServer.id),
        getKdeConnectMpris(phoneServer.id),
        getKdeConnectTelephony(phoneServer.id),
      ]);
      if (bat.status === 'fulfilled' && bat.value) {
        setBattery((prev: any) => ({ ...prev, ...bat.value }));
      }
      if (notif.status === 'fulfilled') setKdeNotifications(notif.value || []);
      if (mpris.status === 'fulfilled') setKdeMpris(mpris.value);
      if (tel.status === 'fulfilled') setKdeTelephony(tel.value);
      // Honest badge: KDE is only "connected" when at least one probe returned.
      const anyKde = [bat, notif, mpris, tel].some(r => r.status === 'fulfilled' && r.value != null);
      setKdeConnected(anyKde);
      const failedKde = [bat, notif, mpris, tel].filter(r => r.status === 'rejected');
      if (failedKde.length > 0) {
        console.error('KDE Connect probes failed:', failedKde.map(r => (r as PromiseRejectedResult).reason));
      }
    } catch (e) {
      console.error('KDE Connect refresh failed:', e);
      setKdeConnected(false);
    }
  }, [phoneServer]);

  useEffect(() => {
    refreshPhone();
    const interval = setInterval(refreshPhone, 10000);
    return () => clearInterval(interval);
  }, [refreshPhone]);

  const loadSmsConversations = async () => {
    if (!phoneServer) return;
    setSmsLoading(true);
    try {
      const convos = await phoneGetSmsConversations(phoneServer.id);
      setSmsConversations(convos || []);
    } catch {
      setSmsConversations([]);
    }
    setSmsLoading(false);
  };

  const loadSmsMessages = async (address: string) => {
    if (!phoneServer) return;
    setSelectedConversation(address);
    setNewSmsNumber(address);
    setSmsLoading(true);
    try {
      const messages = await phoneGetSmsByAddress(phoneServer.id, address);
      setSmsMessages(messages || []);
    } catch {
      setSmsMessages([]);
    }
    setSmsLoading(false);
  };

  const loadCallLog = async () => {
    if (!phoneServer) return;
    try {
      const log = await phoneGetCallLog(phoneServer.id);
      setCallLog(log || []);
    } catch {
      setCallLog([]);
    }
  };

  const loadContacts = async () => {
    if (!phoneServer) return;
    try {
      const list = await phoneGetContacts(phoneServer.id);
      setContacts(list || []);
    } catch {
      setContacts([]);
    }
  };

  const loadSftp = async (path: string) => {
    if (!phoneServer) return;
    setSftpPath(path);
    try {
      const files = await kdeConnectSftpList(phoneServer.id, path);
      setSftpFiles(files || []);
    } catch {
      setSftpFiles([]);
    }
  };

  const sendSms = async () => {
    if (!phoneServer || !newSmsNumber || !newSmsBody) return;
    setSmsSending(true);
    try {
      await kdeConnectSendSms(phoneServer.id, newSmsNumber, newSmsBody);
      setNewSmsBody('');
      if (selectedConversation && selectedConversation === newSmsNumber) {
        await loadSmsMessages(newSmsNumber);
      }
    } catch (e: any) {
      alert('Failed to send: ' + (typeof e === 'string' ? e : e?.message ?? String(e)));
    }
    setSmsSending(false);
  };

  if (!phoneServer) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-4xl mb-4">📱</div>
          <h2 className="text-lg font-heading font-bold mb-2">No Phone Connected</h2>
          <p className="text-sm text-muted">Add a phone server to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-bold">{phoneDevice?.model || phoneServer.name}</h1>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className={`w-2 h-2 rounded-full ${phoneConnected ? 'bg-green' : 'bg-red'}`} />
          <span>ADB: {phoneConnected ? 'Connected' : 'Offline'}</span>
          <span className={`w-2 h-2 rounded-full ${kdeConnected ? 'bg-green' : 'bg-red'}`} />
          <span>KDE: {kdeConnected ? 'Connected' : 'Offline'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CardSection title="Battery">
          <div className="flex items-center justify-around">
            <GaugeRing value={batteryLevel} label={batteryCharging ? 'Charging' : 'Battery'} color={batteryCharging ? '#22C55E' : '#2DD4BF'} />
            <div className="text-center">
              <div className="text-3xl font-heading font-bold">{batteryLevel}%</div>
              <div className="text-xs text-muted">{batteryCharging ? 'Charging' : 'Discharging'}</div>
              {battery?.temperature && (
                <div className="text-xs text-muted">{battery.temperature}°C</div>
              )}
              {phoneThermal && (phoneThermal.battery_temp_c != null || phoneThermal.cpu_temp_c != null || phoneThermal.gpu_temp_c != null) && (
                <div className="mt-1.5 space-y-0.5 text-xs text-muted">
                  {phoneThermal.battery_temp_c != null && <div>Battery: {phoneThermal.battery_temp_c.toFixed(1)}°C</div>}
                  {phoneThermal.cpu_temp_c != null && <div>CPU: {phoneThermal.cpu_temp_c.toFixed(1)}°C</div>}
                  {phoneThermal.gpu_temp_c != null && <div>GPU: {phoneThermal.gpu_temp_c.toFixed(1)}°C</div>}
                </div>
              )}
              {battery?.current_ua != null && battery.current_ua !== 0 && (
                <div className="text-xs text-muted">
                  {battery.current_ua > 0
                    ? `Drain ${(battery.current_ua / 1000).toFixed(0)} mA`
                    : `Charge ${(-battery.current_ua / 1000).toFixed(0)} mA`}
                </div>
              )}
              {battery?.cycle_count != null && (
                <div className="text-xs text-muted">Cycles: {battery.cycle_count}</div>
              )}
            </div>
          </div>
        </CardSection>

        <CardSection title="Storage">
          <div className="space-y-2">
            <div className="h-3 bg-line rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal to-teal-dim transition-all"
                style={{ width: `${phoneStorage?.used_pct || 0}%` }}
              />
            </div>
            <div className="flex justify-between text-sm">
              <span>{phoneStorage?.used_gb?.toFixed(1) || '?'} GB used</span>
              <span>{phoneStorage?.free_gb?.toFixed(1) || '?'} GB free / {phoneStorage?.total_gb?.toFixed(1) || '?'} GB</span>
            </div>
          </div>
        </CardSection>

        <CardSection title="Memory">
          <div className="space-y-2">
            <div className="h-3 bg-line rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal to-teal-dim transition-all"
                style={{ width: `${phoneMemory?.used_pct || 0}%` }}
              />
            </div>
            <div className="flex justify-between text-sm">
              <span>{phoneMemory ? ((phoneMemory.total_mb - phoneMemory.available_mb) / 1024).toFixed(1) + ' GB used' : '? GB used'}</span>
              <span>{phoneMemory?.available_mb ? (phoneMemory.available_mb / 1024).toFixed(1) + ' GB avail' : '? GB avail'} / {phoneMemory?.total_mb ? (phoneMemory.total_mb / 1024).toFixed(1) + ' GB' : '?'}</span>
            </div>
          </div>
        </CardSection>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CardSection title="Network">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">WiFi</span>
              <span>{phoneNetwork?.wifi_ssid || 'Disconnected'}</span>
            </div>
            {phoneNetwork?.wifi_ip && (
              <div className="flex justify-between">
                <span className="text-muted">IP</span>
                <span className="font-mono text-xs">{phoneNetwork.wifi_ip}</span>
              </div>
            )}
            {phoneNetwork?.wifi_rssi && (
              <div className="flex justify-between">
                <span className="text-muted">WiFi Signal</span>
                <span>{phoneNetwork.wifi_rssi} dBm</span>
              </div>
            )}
            {phoneNetwork?.wifi_link_speed && (
              <div className="flex justify-between">
                <span className="text-muted">WiFi Speed</span>
                <span>{phoneNetwork.wifi_link_speed}</span>
              </div>
            )}
            {phoneNetwork?.cellular_type && phoneNetwork.cellular_level !== undefined && phoneNetwork.cellular_level > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">Cellular</span>
                <span>{phoneNetwork.cellular_type} (Level {phoneNetwork.cellular_level})</span>
              </div>
            )}
            {phoneNetwork?.bluetooth_on && (
              <div className="flex justify-between">
                <span className="text-muted">Bluetooth</span>
                <span>On</span>
              </div>
            )}
            {phoneNetwork?.airplane_mode && (
              <div className="flex justify-between">
                <span className="text-muted">Airplane Mode</span>
                <span>On</span>
              </div>
            )}
          </div>
        </CardSection>

        <CardSection title="Device Info">
          <div className="space-y-2 text-sm">
            {phoneDevice && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted">Model</span>
                  <span className="font-mono">{phoneDevice.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Android</span>
                  <span>{phoneDevice.android_version} (API {phoneDevice.api_level})</span>
                </div>
                {phoneDevice.oneui_version && (
                  <div className="flex justify-between">
                    <span className="text-muted">One UI</span>
                    <span>{phoneDevice.oneui_version}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </CardSection>

        <CardSection title="Current Activity">
          <div className="space-y-2 text-sm">
            {phoneActivity && (
              <>
                <div className="font-mono text-xs">{phoneActivity.package}</div>
                <div className="text-xs text-muted">{phoneActivity.activity}</div>
              </>
            )}
          </div>
        </CardSection>
      </div>

      {kdeNotifications.length > 0 && (
        <CardSection title="Notifications">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {kdeNotifications.slice(0, 10).map((notif: any) => (
              <div key={notif.id} className="p-3 bg-ink rounded-lg border border-line text-sm">
                <div className="font-medium text-xs">
                  {notif.app_name && <span className="text-teal">{notif.app_name}: </span>}
                  {notif.title || `Notification #${notif.id}`}
                </div>
                {notif.text && (
                  <div className="text-xs text-muted mt-1 line-clamp-2">{notif.text}</div>
                )}
              </div>
            ))}
            {kdeNotifications.length > 10 && (
              <div className="text-xs text-muted text-center py-2">
                +{kdeNotifications.length - 10} more notifications
              </div>
            )}
          </div>
        </CardSection>
      )}

      {kdeMpris && (
        <CardSection title="Media Control">
          <div className="space-y-4">
            {kdeMpris.title && (
              <div>
                <div className="font-medium">{kdeMpris.title}</div>
                {kdeMpris.artist && <div className="text-sm text-muted">{kdeMpris.artist}</div>}
                {kdeMpris.album && <div className="text-xs text-muted">{kdeMpris.album}</div>}
              </div>
            )}
            <div className="flex items-center gap-4">
              <button onClick={() => kdeConnectMprisPrevious(phoneServer.id)} className="btn btn-ghost btn-sm">⏮</button>
              <button onClick={() => kdeConnectMprisPlayPause(phoneServer.id)} className="btn btn-primary btn-sm">
                {kdeMpris.is_playing ? '⏸ Pause' : '▶ Play'}
              </button>
              <button onClick={() => kdeConnectMprisNext(phoneServer.id)} className="btn btn-ghost btn-sm">⏭</button>
              <div className="flex-1" />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Volume</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round((kdeMpris.volume || 0) * 100)}
                  onChange={e => kdeConnectMprisSetVolume(phoneServer.id, Number(e.target.value) / 100)}
                  className="w-32 accent-teal"
                />
              </div>
            </div>
          </div>
        </CardSection>
      )}

      <CardSection title="Quick Actions">
        <div className="flex flex-wrap gap-3">
          <button onClick={async () => { await phoneScreenshot(phoneServer.id); alert('Screenshot saved'); }} className="btn btn-ghost btn-sm">📱 Screenshot</button>
          <button onClick={() => { if (confirm('Reboot phone?')) phoneReboot(phoneServer.id); }} className="btn btn-ghost btn-sm border-red/30 text-red">🔄 Reboot</button>
          <button onClick={() => kdeConnectRingDevice(phoneServer.id)} className="btn btn-ghost btn-sm">🔔 Find Phone</button>
          <button onClick={() => launchRustdesk(phoneServer.id)} className="btn btn-primary btn-sm">🖥 RustDesk</button>
          <button onClick={() => phoneVolumeDown(phoneServer.id)} className="btn btn-ghost btn-sm">🔊 Vol -</button>
          <button onClick={() => phoneVolumeUp(phoneServer.id)} className="btn btn-ghost btn-sm">🔊 Vol +</button>
          <button onClick={() => phoneSetScreen(phoneServer.id, !phoneScreen?.on)} className="btn btn-ghost btn-sm">
            {phoneScreen?.on ? '📴 Screen Off' : '📱 Screen On'}
          </button>
        </div>
      </CardSection>

      <CardSection title="Messages">
        <div className="flex gap-4 min-h-[300px]">
          <div className="w-1/3 border-r border-line pr-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted">CONVERSATIONS</span>
              <button onClick={loadSmsConversations} disabled={smsLoading} className="btn btn-ghost btn-xs">
                {smsLoading ? '...' : '↻'}
              </button>
            </div>
            {smsConversations.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center">No conversations</p>
            ) : (
              <div className="space-y-1 max-h-[250px] overflow-y-auto">
{smsConversations.map((conv) => (
                    <button
                      key={conv.address}
                      onClick={() => loadSmsMessages(conv.address)}
                      className={`w-full text-left p-2 rounded text-sm hover:bg-ink transition-colors ${
                        selectedConversation === conv.address ? 'bg-ink border border-line' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-off truncate">{conv.contact_name || conv.address}</span>
                        <span className="text-[10px] text-muted">
                          {new Date(conv.last_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-muted truncate mt-0.5">{conv.last_message}</p>
                      {conv.unread_count > 0 && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded-full">
                          {conv.unread_count} new
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col">
{selectedConversation ? (
                  <>
                    <div className="text-xs text-muted mb-2 font-mono">
                      {smsConversations.find(c => c.address === selectedConversation)?.contact_name || selectedConversation}
                    </div>
                <div className="flex-1 overflow-y-auto space-y-2 mb-3 max-h-[200px]">
                  {smsMessages.length === 0 ? (
                    <p className="text-xs text-muted py-4 text-center">No messages</p>
                  ) : (
                    smsMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`p-2 rounded text-sm max-w-[80%] ${
                          msg.type_ === '2' 
                            ? 'bg-blue-500/20 ml-auto text-right' 
                            : 'bg-ink border border-line'
                        }`}
                      >
                        <p className="text-off">{msg.body}</p>
                        <span className="text-[10px] text-muted">
                          {new Date(msg.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={newSmsNumber}
                    onChange={(e) => setNewSmsNumber(e.target.value)}
                    placeholder="To..."
                    className="flex-1 input input-sm bg-ink border-line text-off placeholder-muted font-mono"
                  />
                  <input
                    type="text"
                    value={newSmsBody}
                    onChange={(e) => setNewSmsBody(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendSms()}
                    placeholder="Message..."
                    className="flex-[2] input input-sm bg-ink border-line text-off placeholder-muted"
                  />
                  <button
                    onClick={sendSms}
                    disabled={smsSending || !newSmsNumber || !newSmsBody}
                    className="btn btn-primary btn-sm"
                  >
                    {smsSending ? '...' : 'Send'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-muted">Select a conversation</p>
              </div>
            )}
          </div>
        </div>
      </CardSection>

      <CardSection title="Clipboard Sync">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1.5 font-mono">Phone Clipboard</label>
            <input
              type="text"
              value={kdeClipboard}
              readOnly
              className="w-full input input-sm bg-ink border-line text-off font-mono"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                try {
                  const clip = await kdeConnectGetClipboard(phoneServer.id);
                  setKdeClipboard(clip);
                } catch (e: any) {
                  alert('Failed: ' + (typeof e === 'string' ? e : e?.message ?? String(e)));
                }
              }}
              className="btn btn-ghost btn-sm"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </CardSection>

      <CardSection title="Utilities">
        <div className="space-y-4">
          {kdeTelephony && (
            <div className="p-3 bg-ink rounded-lg border border-line">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${kdeTelephony.is_ringing ? 'bg-red animate-pulse' : kdeTelephony.is_active ? 'bg-green' : 'bg-muted'}`} />
                <div>
                  <div className="font-medium">
                    {kdeTelephony.is_ringing ? '📞 Incoming Call' : kdeTelephony.is_active ? '📞 Active Call' : '📵 No Active Call'}
                  </div>
                  {kdeTelephony.number && <div className="text-sm text-muted font-mono">{kdeTelephony.number}</div>}
                  {kdeTelephony.name && <div className="text-xs text-muted">{kdeTelephony.name}</div>}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <input
              type="text"
              id="phone-ping-message"
              placeholder="Ping message..."
              className="flex-1 input input-sm bg-ink border-line text-off placeholder-muted"
            />
            <button
              onClick={async () => {
                const input = document.getElementById('phone-ping-message') as HTMLInputElement;
                if (input.value) {
                  try {
                    await kdeConnectSendPing(phoneServer.id, input.value);
                    alert('Ping sent!');
                    input.value = '';
                  } catch (e: any) {
                    alert('Failed: ' + (typeof e === 'string' ? e : e?.message ?? String(e)));
                  }
                }
              }}
              className="btn btn-ghost btn-sm"
            >
              🔔 Send Ping
            </button>
          </div>

          <div className="flex gap-3">
            <input
              type="url"
              id="phone-share-url"
              placeholder="https://example.com"
              className="flex-1 input input-sm bg-ink border-line text-off placeholder-muted font-mono"
            />
            <button
              onClick={async () => {
                const input = document.getElementById('phone-share-url') as HTMLInputElement;
                if (input.value) {
                  try {
                    await kdeConnectShareUrl(phoneServer.id, input.value);
                    alert('URL shared to phone!');
                    input.value = '';
                  } catch (e: any) {
                    alert('Failed: ' + (typeof e === 'string' ? e : e?.message ?? String(e)));
                  }
                }
              }}
              className="btn btn-ghost btn-sm"
            >
              🔗 Share URL
            </button>
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              id="phone-share-text"
              placeholder="Text to share..."
              className="flex-1 input input-sm bg-ink border-line text-off placeholder-muted"
            />
            <button
              onClick={async () => {
                const input = document.getElementById('phone-share-text') as HTMLInputElement;
                if (input.value) {
                  try {
                    await kdeConnectShareText(phoneServer.id, input.value);
                    alert('Text shared to phone!');
                    input.value = '';
                  } catch (e: any) {
                    alert('Failed: ' + (typeof e === 'string' ? e : e?.message ?? String(e)));
                  }
                }
              }}
              className="btn btn-ghost btn-sm"
            >
              📝 Share Text
            </button>
          </div>
        </div>
      </CardSection>

      {/* Call Log */}
      <CardSection title="Call Log">
        <div className="space-y-2">
          <button onClick={loadCallLog} className="btn btn-ghost btn-sm mb-3">↻ Refresh</button>
          {callLog.length === 0 ? (
            <p className="text-sm text-muted">No call history</p>
          ) : (
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {callLog.slice(0, 20).map((call) => (
                <div key={call.id} className="flex items-center justify-between p-2 bg-ink rounded text-sm">
                  <div className="flex items-center gap-2">
                    <span className={call.type_ === 'Incoming' ? 'text-green' : call.type_ === 'Missed' ? 'text-red' : 'text-blue'}>
                      {call.type_ === 'Incoming' ? '📞' : call.type_ === 'Missed' ? '📵' : '📤'}
                    </span>
                    <div>
                      <div className="font-mono">{call.number}</div>
                      {call.name && <div className="text-xs text-muted">{call.name}</div>}
                    </div>
                  </div>
                  <div className="text-xs text-muted">
                    {call.duration > 0 ? `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}` : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardSection>

      {/* Contacts */}
      <CardSection title="Contacts">
        <div className="space-y-2">
          <button onClick={loadContacts} className="btn btn-ghost btn-sm mb-3">↻ Refresh</button>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted">No contacts loaded</p>
          ) : (
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {contacts.slice(0, 50).map((contact) => (
                <div key={contact.id} className="flex items-center justify-between p-2 bg-ink rounded text-sm">
                  <div>
                    <div className="font-medium">{contact.display_name}</div>
                    {contact.phone_numbers.length > 0 && (
                      <div className="text-xs text-muted font-mono">{contact.phone_numbers[0]}</div>
                    )}
                  </div>
                  <div className="text-xs text-muted">{contact.phone_numbers.length} numbers</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardSection>

      {/* SFTP File Browser */}
      <CardSection title="File Browser">
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-muted font-mono">{sftpPath}</span>
            {sftpPath !== '/' && (
              <button onClick={() => loadSftp('/')} className="btn btn-ghost btn-xs">🏠 Root</button>
            )}
            <button onClick={() => loadSftp(sftpPath)} className="btn btn-ghost btn-xs">↻</button>
          </div>
          {sftpFiles.length === 0 ? (
            <button onClick={() => loadSftp('/')} className="btn btn-ghost btn-sm">📂 Browse Files</button>
          ) : (
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {sftpFiles.map((file) => (
                <div
                  key={file.path}
                  onClick={() => file.is_dir && loadSftp(file.path)}
                  className={`flex items-center gap-2 p-2 bg-ink rounded text-sm ${file.is_dir ? 'cursor-pointer hover:bg-line' : ''}`}
                >
                  <span>{file.is_dir ? '📁' : '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{file.name}</div>
                    {!file.is_dir && file.size && (
                      <div className="text-xs text-muted">{(file.size / 1024).toFixed(1)} KB</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardSection>
    </div>
  );
}
