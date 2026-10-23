import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Alert, AlertFilter, AlertSeverity } from '../../lib/tauri-commands';
import { alertList, alertAcknowledge, alertAcknowledgeAll, alertDelete, alertEvaluateAutoAck } from '../../lib/tauri-commands';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tooltip } from '../../components/ui/Tooltip';
import { ConfirmDialog } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { ToastManager, useToast } from '../../components/ui/Toast';

const SEVERITY_CONFIG: Record<AlertSeverity, { color: string; bg: string; icon: string; label: string }> = {
  critical: { color: 'var(--kts-status-error)', bg: 'var(--kts-status-error-bg)', icon: '🔴', label: 'Critical' },
  warning: { color: 'var(--kts-status-warning)', bg: 'var(--kts-status-warning-bg)', icon: '🟡', label: 'Warning' },
  info: { color: 'var(--kts-status-info)', bg: 'var(--kts-status-info-bg)', icon: '🟢', label: 'Info' },
};

const SOURCE_LABELS: Record<string, string> = {
  meshcentral: 'MeshCentral',
  graphql: 'GraphQL',
  ssh: 'SSH',
  task: 'Task',
  manual: 'Manual',
  auto: 'Auto',
};

export function AlertCenter() {
  const { toasts, removeToast, addToast } = useToast();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AlertFilter>({});
  const [showFilters, setShowFilters] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Alert | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadAlerts = useCallback(async () => {
    try {
      const data = await alertList(filter);
      setAlerts(data);
    } catch (e) {
      addToast({ type: 'error', title: 'Failed to load alerts', message: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [filter, addToast]);

  useEffect(() => {
    loadAlerts();
    if (autoRefresh) {
      const timer = setInterval(loadAlerts, 30000);
      return () => clearInterval(timer);
    }
  }, [loadAlerts, autoRefresh]);

  const handleAcknowledge = async (alert: Alert) => {
    try {
      const updated = await alertAcknowledge(alert.id!, 'user');
      setAlerts(prev => prev.map(a => a.id === alert.id ? updated : a));
      addToast({ type: 'success', title: 'Acknowledged', message: `"${alert.title}" marked as acknowledged` });
    } catch (e) {
      addToast({ type: 'error', title: 'Failed', message: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  const handleAcknowledgeAll = async () => {
    try {
      const count = await alertAcknowledgeAll(filter.device_id);
      await loadAlerts();
      addToast({ type: 'success', title: 'Acknowledged', message: `${count} alert(s) acknowledged` });
    } catch (e) {
      addToast({ type: 'error', title: 'Failed', message: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  const handleDelete = async (alert: Alert) => {
    setDeleteConfirm(alert);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await alertDelete(deleteConfirm.id!);
      setAlerts(prev => prev.filter(a => a.id !== deleteConfirm.id));
      addToast({ type: 'success', title: 'Deleted', message: 'Alert removed' });
    } catch (e) {
      addToast({ type: 'error', title: 'Failed', message: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setDeleteConfirm(null);
    }
  };

  const runAutoAck = async () => {
    try {
      const count = await alertEvaluateAutoAck();
      await loadAlerts();
      addToast({ type: 'success', title: 'Auto-ack complete', message: `${count} alert(s) auto-acknowledged` });
    } catch (e) {
      addToast({ type: 'error', title: 'Failed', message: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  const stats = useMemo(() => {
    const result: { total: number; unacknowledged: number; critical: number; warning: number; info: number } = {
      total: alerts.length,
      unacknowledged: alerts.filter(a => !a.acknowledged).length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      warning: alerts.filter(a => a.severity === 'warning').length,
      info: alerts.filter(a => a.severity === 'info').length,
    };
    return result;
  }, [alerts]);

  if (loading) {
    return (
      <Card padded>
        <div className="space-y-3">
          <Skeleton variant="rectangular" height="48" />
          <Skeleton variant="rectangular" height="48" />
          <Skeleton variant="rectangular" height="48" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="font-[var(--kts-font-heading)] font-bold text-[var(--kts-font-size-2xl)]">Alert Center</h2>
          <Badge variant={stats.unacknowledged > 0 ? 'danger' : 'success'} size="base" dot>
            {stats.unacknowledged} Unacknowledged
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-[var(--kts-text-secondary)]">
            <span className="font-bold">{stats.total}</span> total
            <span className="mx-1">|</span>
            <span className="text-red-400 font-bold">{stats.critical}</span> critical
            <span className="mx-1">|</span>
            <span className="text-amber-400 font-bold">{stats.warning}</span> warning
            <span className="mx-1">|</span>
            <span className="text-green-400 font-bold">{stats.info}</span> info
          </div>
          <Tooltip content="Run auto-acknowledgment rules" position="top">
            <Button variant="outline" size="sm" leftIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>} onClick={runAutoAck}>
              Auto-Ack
            </Button>
          </Tooltip>
          <Tooltip content="Toggle auto-refresh (30s)" position="top">
            <Button variant={autoRefresh ? 'primary' : 'outline'} size="sm" leftIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>} onClick={() => setAutoRefresh(!autoRefresh)}>
              {autoRefresh ? '🔄 Live' : '⏸ Paused'}
            </Button>
          </Tooltip>
          <Tooltip content="Toggle filters" position="top">
            <Button variant="ghost" size="sm" leftIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>} onClick={() => setShowFilters(!showFilters)}>
              Filters
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card variant="subtle" className="animate-slide-down">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <select
              value={filter.severity || ''}
              onChange={e => setFilter({ ...filter, severity: e.target.value as AlertSeverity || undefined })}
              className="px-3 py-2 rounded border bg-[var(--kts-bg-tertiary)] text-[var(--kts-text-primary)] text-sm"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <select
              value={filter.acknowledged !== undefined ? String(filter.acknowledged) : ''}
              onChange={e => setFilter({ ...filter, acknowledged: e.target.value === '' ? undefined : e.target.value === 'true' })}
              className="px-3 py-2 rounded border bg-[var(--kts-bg-tertiary)] text-[var(--kts-text-primary)] text-sm"
            >
              <option value="">All Status</option>
              <option value="false">Unacknowledged</option>
              <option value="true">Acknowledged</option>
            </select>
            <input
              type="text"
              placeholder="Device ID filter"
              value={filter.device_id || ''}
              onChange={e => setFilter({ ...filter, device_id: e.target.value || undefined })}
              className="px-3 py-2 rounded border bg-[var(--kts-bg-tertiary)] text-[var(--kts-text-primary)] text-sm"
            />
            <input
              type="datetime-local"
              value={filter.since ? filter.since.replace('Z', '').replace('T', 'T') : ''}
              onChange={e => setFilter({ ...filter, since: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
              className="px-3 py-2 rounded border bg-[var(--kts-bg-tertiary)] text-[var(--kts-text-primary)] text-sm"
            />
            <Button variant="outline" size="sm" onClick={() => setFilter({})}>Clear Filters</Button>
            <Button variant="primary" size="sm" onClick={loadAlerts} leftIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>}>Refresh</Button>
          </div>
        </Card>
      )}

      {/* Alerts List */}
      <Card>
        {alerts.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-4xl">📭</span>
            <p className="text-[var(--kts-text-secondary)] mt-2">No alerts found</p>
            <p className="text-[var(--kts-text-tertiary)] text-sm mt-1">Adjust filters or wait for new alerts</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--kts-border-default)]">
            {alerts.map((alert) => {
              const sev = SEVERITY_CONFIG[alert.severity];
              return (
                <div
                  key={alert.id}
                  className="p-4 flex flex-wrap items-start justify-between gap-4 transition-colors hover:bg-[var(--kts-interactive-hover)]"
                  style={{ borderLeft: `4px solid ${sev.color}` }}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: sev.color }} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-[var(--kts-text-primary)]">{alert.title}</span>
                        <Badge variant={alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'info'} size="sm" dot>
                          {sev.label}
                        </Badge>
                        <Badge variant="subtle" size="xs">{SOURCE_LABELS[alert.source] || alert.source}</Badge>
                        {alert.acknowledged && (
                          <Badge variant="success" size="xs" dot>✓ Acknowledged</Badge>
                        )}
                      </div>
                      <p className="text-[var(--kts-text-secondary)] text-sm mt-1 truncate">{alert.message}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-[var(--kts-text-tertiary)] font-[var(--kts-font-mono)]">
                        <span>Created: {new Date(alert.created_at).toLocaleString()}</span>
                        {alert.device_id && <span>Device: {alert.device_id}</span>}
                        {alert.acknowledged_at && <span>Acked: {new Date(alert.acknowledged_at).toLocaleString()} by {alert.acknowledged_by}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!alert.acknowledged && (
                      <Tooltip content="Acknowledge" position="top">
                        <Button variant="ghost" size="sm" onClick={() => handleAcknowledge(alert)} leftIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>}>
                          Acknowledge
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip content="Delete" position="top">
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(alert)} leftIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"/></svg>} className="text-red-400 hover:text-red-300" aria-label="Delete alert">
                        Delete
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bulk Actions Footer */}
        {alerts.length > 0 && alerts.some(a => !a.acknowledged) && (
          <div className="p-4 border-t border-[var(--kts-border-default)] flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => handleAcknowledgeAll()} leftIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>}>
              Acknowledge All ({alerts.filter(a => !a.acknowledged).length})
            </Button>
          </div>
        )}
      </Card>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setDeleteConfirm(null)}
          title="Delete Alert?"
          message={`Are you sure you want to delete "${deleteConfirm.title}"? This action cannot be undone.`}
          confirmText="Delete"
          variant="danger"
          onConfirm={confirmDelete}
        />
      )}

      <ToastManager toasts={toasts} onClose={removeToast} position="top-right" />
    </div>
  );
}