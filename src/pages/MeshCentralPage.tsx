import { useState, useEffect, useMemo } from 'react';
import { meshcentralListDevices, meshcentralGetEnrollmentInfo, meshcentralSyncFleet, meshcentralExecuteBatch, meshcentralGetTerminalUrl, meshcentralGetFileManagerUrl } from '../lib/tauri-commands';
import { Card, CardSection } from '../components/ui/Card';
import { Button, IconButton } from '../components/ui/Button';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { Tooltip } from '../components/ui/Tooltip';
import { Modal } from '../components/ui/Modal';
import { ToastManager, useToast } from '../components/ui/Toast';

interface MeshDevice {
  id: string;
  name: string;
  group: string;
  conn: number;
  pwr: number;
  platform: string;
  ip: string;
  last_connect?: string;
}

interface EnrollmentInfo {
  agent_url: string;
  settings_url: string;
  group_id: string;
  install_command_linux: string;
  install_command_windows: string;
}

interface SyncResult {
  devices_found: number;
  devices_matched: number;
  devices_new: number;
  devices_updated: number;
  errors: string[];
}

interface BatchCommand {
  command: string;
  args?: string[];
}

export function MeshCentralPage() {
  const { toasts, removeToast, addToast } = useToast();
  const [devices, setDevices] = useState<MeshDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [enrollmentInfo, setEnrollmentInfo] = useState<EnrollmentInfo | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [batchCommands, setBatchCommands] = useState<BatchCommand[]>([{ command: '', args: [] }]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResults, setBatchResults] = useState<any[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);

  const loadDevices = async () => {
    setLoading(true);
    try {
      const data = await meshcentralListDevices();
      setDevices(data);
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Failed to load MeshCentral devices',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await meshcentralSyncFleet();
      setSyncResult(result);
      addToast({
        type: result.errors.length > 0 ? 'warning' : 'success',
        title: 'Sync Complete',
        message: `Matched: ${result.devices_matched}, New: ${result.devices_new}, Updated: ${result.devices_updated}`,
      });
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Sync Failed',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleEnroll = async (deviceType: string) => {
    setEnrolling(deviceType);
    try {
      const info = await meshcentralGetEnrollmentInfo(deviceType);
      setEnrollmentInfo(info);
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Enrollment Info Failed',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setEnrolling(null);
    }
  };

  const handleCopyInstallCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    addToast({
      type: 'success',
      title: 'Copied',
      message: 'Install command copied to clipboard',
    });
  };

  const handleOpenTerminal = async (deviceId: string) => {
    try {
      const url = await meshcentralGetTerminalUrl(deviceId);
      window.open(url, '_blank', 'width=1200,height=800');
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Terminal Failed',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  };

  const handleOpenFileManager = async (deviceId: string) => {
    try {
      const url = await meshcentralGetFileManagerUrl(deviceId);
      window.open(url, '_blank', 'width=1200,height=800');
    } catch (e) {
      addToast({
        type: 'error',
        title: 'File Manager Failed',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  };

  const handleBatchExecute = async () => {
    if (selectedDevices.length === 0 || batchCommands.every(c => !c.command.trim())) {
      addToast({ type: 'warning', title: 'Missing Selection', message: 'Select devices and enter commands' });
      return;
    }

    setBatchRunning(true);
    try {
      const validCommands = batchCommands.filter(c => c.command.trim());
      const results = await meshcentralExecuteBatch(selectedDevices, validCommands);
      setBatchResults(results);
      addToast({
        type: 'success',
        title: 'Batch Complete',
        message: `Executed on ${selectedDevices.length} device(s)`,
      });
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Batch Failed',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setBatchRunning(false);
    }
  };

  const addBatchCommand = () => {
    setBatchCommands([...batchCommands, { command: '', args: [] }]);
  };

  const removeBatchCommand = (index: number) => {
    if (batchCommands.length > 1) {
      setBatchCommands(batchCommands.filter((_, i) => i !== index));
    }
  };

  const updateBatchCommand = (index: number, field: 'command' | 'args', value: string) => {
    setBatchCommands(batchCommands.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const toggleDeviceSelection = (deviceId: string) => {
    setSelectedDevices(prev => prev.includes(deviceId)
      ? prev.filter(id => id !== deviceId)
      : [...prev, deviceId]);
  };

  const selectAllDevices = () => {
    setSelectedDevices(devices.filter(d => d.conn >= 1).map(d => d.id));
  };

  const clearDeviceSelection = () => {
    setSelectedDevices([]);
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const connectionStatus = useMemo(() => {
    const online = devices.filter(d => d.conn >= 1).length;
    const offline = devices.filter(d => d.conn === 0).length;
    return { online, offline, total: devices.length };
  }, [devices]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <h1 className="font-[var(--kts-font-heading)] font-bold" style={{ fontSize: 'var(--kts-font-size-4xl)', letterSpacing: '-0.02em' }}>
            MeshCentral Fleet
          </h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-48 bg-[var(--kts-bg-tertiary)] rounded-lg animate-pulse" />
          <div className="h-48 bg-[var(--kts-bg-tertiary)] rounded-lg animate-pulse" />
          <div className="h-48 bg-[var(--kts-bg-tertiary)] rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-[var(--kts-font-heading)] font-bold" style={{ fontSize: 'var(--kts-font-size-4xl)', letterSpacing: '-0.02em' }}>
            MeshCentral Fleet
          </h1>
          <p className="text-[var(--kts-text-secondary)] mt-1">
            {connectionStatus.total} devices · {connectionStatus.online} online · {connectionStatus.offline} offline
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tooltip content="Sync fleet from MeshCentral" position="top">
            <Button variant="primary" size="sm" leftIcon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>} onClick={handleSync} loading={syncing}>
              Sync
            </Button>
          </Tooltip>
          <Tooltip content="Batch command execution" position="top">
            <Button variant="outline" size="sm" leftIcon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>} onClick={() => setShowBatchModal(true)} disabled={connectionStatus.online === 0}>
              Batch Commands
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Sync Result Banner */}
      {syncResult && (
        <Card variant={syncResult.errors.length > 0 ? 'amber' : 'default'} className="animate-slide-up">
          <CardSection title="Last Sync Result">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-[var(--kts-text-secondary)]">Devices Found</span><div className="font-bold">{syncResult.devices_found}</div></div>
              <div><span className="text-[var(--kts-text-secondary)]">Matched</span><div className="font-bold text-green-500">{syncResult.devices_matched}</div></div>
              <div><span className="text-[var(--kts-text-secondary)]">New</span><div className="font-bold text-amber-500">{syncResult.devices_new}</div></div>
              <div><span className="text-[var(--kts-text-secondary)]">Updated</span><div className="font-bold text-blue-500">{syncResult.devices_updated}</div></div>
            </div>
            {syncResult.errors.length > 0 && (
              <div className="mt-3 p-3 rounded bg-[var(--kts-bg-tertiary)] text-sm text-amber-400">
                <strong>Unmatched devices:</strong>
                <ul className="mt-1 list-disc list-inside space-y-1">
                  {syncResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </CardSection>
        </Card>
      )}

      {/* Enrollment Modal */}
      {enrollmentInfo && (
        <Modal
          isOpen={true}
          onClose={() => { setEnrollmentInfo(null); setEnrolling(null); }}
          title={`Enroll ${enrolling} Device`}
          size="lg"
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <p className="text-[var(--kts-text-secondary)] text-sm">
              Run the appropriate command on the target device. The MeshCentral agent will connect to the Home group automatically.
            </p>

            <div className="rounded-lg bg-[var(--kts-bg-tertiary)] p-4 space-y-3">
              <h4 className="font-medium text-[var(--kts-text-primary)]">Linux (Bazzite/Fedora/Ubuntu/Debian)</h4>
              <div className="relative">
                <pre className="bg-black/50 p-3 rounded text-xs overflow-x-auto font-mono whitespace-pre-wrap text-green-300 max-h-60 overflow-y-auto">{enrollmentInfo.install_command_linux}</pre>
                <Button variant="ghost" size="xs" className="absolute top-2 right-2" onClick={() => handleCopyInstallCommand(enrollmentInfo.install_command_linux)}>
                  Copy
                </Button>
              </div>
            </div>

            <div className="rounded-lg bg-[var(--kts-bg-tertiary)] p-4 space-y-3">
              <h4 className="font-medium text-[var(--kts-text-primary)]">Windows (PowerShell)</h4>
              <div className="relative">
                <pre className="bg-black/50 p-3 rounded text-xs overflow-x-auto font-mono whitespace-pre-wrap text-blue-300 max-h-60 overflow-y-auto">{enrollmentInfo.install_command_windows}</pre>
                <Button variant="ghost" size="xs" className="absolute top-2 right-2" onClick={() => handleCopyInstallCommand(enrollmentInfo.install_command_windows)}>
                  Copy
                </Button>
              </div>
            </div>

            <div className="text-xs text-[var(--kts-text-tertiary)]">
              Agent URL: <code className="font-mono">{enrollmentInfo.agent_url}</code><br />
              Settings URL: <code className="font-mono">{enrollmentInfo.settings_url}</code>
            </div>
          </div>
        </Modal>
      )}

      {/* Batch Commands Modal */}
      <Modal
        isOpen={showBatchModal}
        onClose={() => { setShowBatchModal(false); setBatchResults([]); }}
        title="Batch Command Execution"
        size="xl"
      >
        <div className="space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Device Selection */}
          <Card>
            <CardSection title="Target Devices" subtitle={`${selectedDevices.length} of ${connectionStatus.online} online devices selected`}>
              <div className="flex flex-wrap gap-2 mb-3">
                <Button variant="outline" size="sm" onClick={selectAllDevices} disabled={connectionStatus.online === 0}>Select All Online</Button>
                <Button variant="ghost" size="sm" onClick={clearDeviceSelection}>Clear</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                {devices.filter(d => d.conn >= 1).map(device => (
                  <label key={device.id} className="flex items-center gap-2 p-2 rounded border transition-colors hover:bg-[var(--kts-interactive-hover)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedDevices.includes(device.id)}
                      onChange={() => toggleDeviceSelection(device.id)}
                      className="w-4 h-4 accent-[var(--kts-brand-primary)]"
                    />
                    <span className="font-mono text-sm">{device.name}</span>
                    <Badge variant={device.conn === 2 ? 'success' : 'warning'} size="xs">
                      {device.conn === 2 ? 'Connected' : 'Online'}
                    </Badge>
                    <span className="text-[var(--kts-text-tertiary)] text-xs ml-auto">{device.platform} · {device.ip}</span>
                  </label>
                ))}
              </div>
            </CardSection>
          </Card>

          {/* Command Input */}
          <Card>
            <CardSection title="Commands" subtitle="Each command runs sequentially on all selected devices">
              <div className="space-y-3">
                {batchCommands.map((cmd, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <input
                      type="text"
                      placeholder={`Command ${index + 1} (e.g., "uptime", "df -h", "systemctl status docker")`}
                      value={cmd.command}
                      onChange={(e) => updateBatchCommand(index, 'command', e.target.value)}
                      className="flex-1 px-3 py-2 rounded border bg-[var(--kts-bg-tertiary)] text-[var(--kts-text-primary)] text-sm font-mono"
                      style={{ fontSize: 'var(--kts-font-size-sm)' }}
                    />
                    <Button variant="ghost" size="sm" onClick={() => removeBatchCommand(index)} disabled={batchCommands.length <= 1} aria-label="Remove command">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" leftIcon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>} onClick={addBatchCommand}>
                  Add Command
                </Button>
              </div>
            </CardSection>
          </Card>

          {/* Execute Button */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowBatchModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleBatchExecute} loading={batchRunning} disabled={selectedDevices.length === 0 || batchCommands.every(c => !c.command.trim())}>
              Execute on {selectedDevices.length} Device(s)
            </Button>
          </div>

          {/* Results */}
          {batchResults.length > 0 && (
            <Card variant="dual">
              <CardSection title="Results">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {batchResults.map((result, index) => (
                    <div key={index} className="p-3 rounded border bg-[var(--kts-bg-tertiary)] text-sm font-mono">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={result.success ? 'success' : 'danger'} size="xs">
                          {result.success ? 'OK' : 'FAILED'}
                        </Badge>
                        <span className="text-[var(--kts-text-secondary)]">Device: {result.device_id}</span>
                      </div>
                      {result.error && (
                        <div className="text-red-400 whitespace-pre-wrap">{result.error}</div>
                      )}
                      {result.output && (
                        <details className="mt-1">
                          <summary className="text-[var(--kts-text-tertiary)] cursor-pointer">Output ({result.output.length} chars)</summary>
                          <pre className="mt-1 whitespace-pre-wrap text-xs overflow-x-auto">{result.output}</pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </CardSection>
            </Card>
          )}
        </div>
      </Modal>

      {/* Device Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {devices.map((device) => {
          const isOnline = device.conn >= 1;
          const isConnected = device.conn === 2;

          return (
            <Card key={device.id} variant={isOnline ? 'default' : 'red'} hoverable className="animate-slide-up">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-[var(--kts-bg-tertiary)]">
                    {device.platform === 'Windows' ? '🪟' : device.platform === 'Linux' ? '🐧' : '❓'}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[var(--kts-text-primary)] truncate">{device.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StatusBadge state={isConnected ? 'running' : isOnline ? 'running' : 'stopped'} size="sm" showDot pulsing={isConnected} />
                      <span className="text-[var(--kts-text-tertiary)] font-[var(--kts-font-mono)] text-xs">{device.ip}</span>
                    </div>
                  </div>
                </div>
                <Badge variant={isConnected ? 'success' : isOnline ? 'warning' : 'danger'} size="sm">
                  {isConnected ? 'Connected' : isOnline ? 'Online' : 'Offline'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                <div>
                  <span className="text-[var(--kts-text-secondary)]">Platform</span>
                  <div className="font-[var(--kts-font-mono)] text-[var(--kts-text-primary)]">{device.platform}</div>
                </div>
                <div>
                  <span className="text-[var(--kts-text-secondary)]">Power</span>
                  <div className="font-[var(--kts-font-mono)] text-[var(--kts-text-primary)]">{device.pwr === 1 ? 'On' : 'Off'}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {isOnline && (
                  <>
                    <Tooltip content="Open MeshCentral Terminal" position="bottom">
                      <IconButton variant="outline" size="sm" onClick={() => handleOpenTerminal(device.id)} aria-label="Open Terminal">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
                      </IconButton>
                    </Tooltip>
                    <Tooltip content="Open MeshCentral File Manager" position="bottom">
                      <IconButton variant="outline" size="sm" onClick={() => handleOpenFileManager(device.id)} aria-label="Open File Manager">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                <Tooltip content="Select for batch commands" position="bottom">
                  <input
                    type="checkbox"
                    checked={selectedDevices.includes(device.id)}
                    onChange={() => toggleDeviceSelection(device.id)}
                    disabled={!isOnline}
                    className="w-4 h-4 accent-[var(--kts-brand-primary)] mt-1"
                    aria-label={`Select ${device.name} for batch commands`}
                  />
                </Tooltip>
              </div>

              {device.last_connect && (
                <p className="text-[var(--kts-text-tertiary)] font-[var(--kts-font-mono)] text-xs mt-2">
                  Last seen: {new Date(device.last_connect).toLocaleString()}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      {devices.length === 0 && (
        <Card padded className="text-center py-12">
          <p className="text-[var(--kts-text-secondary)] text-lg">No devices found in MeshCentral</p>
          <p className="text-[var(--kts-text-tertiary)] mt-2">Enroll devices using the buttons above or check MeshCentral server connectivity</p>
        </Card>
      )}

      {/* Quick Enrollment Actions */}
      <Card variant="dual">
        <CardSection title="Enroll New Devices" subtitle="Generate installation commands for each platform">
          <div className="flex flex-wrap gap-3">
            <Tooltip content="Enroll Linux device (Bazzite, Fedora, Ubuntu, Debian)" position="top">
              <Button variant="outline" leftIcon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>} onClick={() => handleEnroll('linux')} loading={enrolling === 'linux'}>
                Linux (Bazzite/Fedora)
              </Button>
            </Tooltip>
            <Tooltip content="Enroll Windows device" position="top">
              <Button variant="outline" leftIcon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>} onClick={() => handleEnroll('windows')} loading={enrolling === 'windows'}>
                Windows
              </Button>
            </Tooltip>
            <Tooltip content="Enroll HTPC (Linux)" position="top">
              <Button variant="outline" leftIcon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17h10"/><path d="M12 12v7"/><path d="M18 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/></svg>} onClick={() => handleEnroll('htpc')} loading={enrolling === 'htpc'}>
                HTPC (Linux)
              </Button>
            </Tooltip>
            <Tooltip content="Enroll Laptop (Linux)" position="top">
              <Button variant="outline" leftIcon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="17" x2="16" y2="17"/></svg>} onClick={() => handleEnroll('laptop')} loading={enrolling === 'laptop'}>
                Laptop (Linux)
              </Button>
            </Tooltip>
          </div>
        </CardSection>
      </Card>

      <ToastManager toasts={toasts} onClose={removeToast} position="top-right" />
    </div>
  );
}