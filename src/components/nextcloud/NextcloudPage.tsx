import { useState, useEffect } from 'react';
import { getNextcloudInfo, getNextcloudStatus, getNextcloudStorage, getNextcloudUsers, getNextcloudActivity } from '../../lib/tauri-commands';
import type { ServerConfig } from '../../lib/types';

interface NextcloudInfo {
  version: string;
  versionstring: string;
  edition: string;
}

interface NextcloudSystemStatus {
  installed: boolean;
  maintenance: boolean;
  needs_db_upgrade: boolean;
  version: string;
  versionstring: string;
  edition: string;
  productname: string;
  extended_support: boolean;
}

interface NextcloudStorage {
  num_users: number;
  num_files: number;
  num_storages: number;
  num_storages_local: number;
  num_storages_home: number;
  num_storages_other: number;
}

interface NextcloudUser {
  id: string;
  display_name: string;
  enabled: boolean;
  quota?: { free: number; used: number; total: number; relative: number };
  email?: string;
  groups: string[];
  backend: string;
  last_login?: number;
}

interface ActivityItem {
  app: string;
  user: string;
  subject: string;
  message: string;
  datetime: string;
  link?: string;
}

interface NextcloudActivity {
  activities: ActivityItem[];
}

export function NextcloudPage({ server }: { server: ServerConfig }) {
  const [info, setInfo] = useState<NextcloudInfo | null>(null);
  const [status, setStatus] = useState<NextcloudSystemStatus | null>(null);
  const [storage, setStorage] = useState<NextcloudStorage | null>(null);
  const [users, setUsers] = useState<NextcloudUser[]>([]);
  const [activity, setActivity] = useState<NextcloudActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'activity' | 'storage'>('overview');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [infoRes, statusRes, storageRes, usersRes, activityRes] = await Promise.all([
        getNextcloudInfo(server.id),
        getNextcloudStatus(server.id),
        getNextcloudStorage(server.id),
        getNextcloudUsers(server.id),
        getNextcloudActivity(server.id, 20),
      ]);
      setInfo(infoRes);
      setStatus(statusRes);
      setStorage(storageRes);
      setUsers(usersRes);
      setActivity(activityRes);
    } catch (err) {
      console.error('Failed to fetch Nextcloud data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [server.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Nextcloud</h1>
        <span className={`px-2 py-1 text-xs font-mono rounded ${
          status?.maintenance ? 'bg-amber-500/20 text-amber' : 'bg-green-500/20 text-green'
        }`}>
          {status?.maintenance ? 'Maintenance Mode' : 'Online'}
        </span>
      </div>

      <div className="flex gap-2 border-b border-line mb-4">
        {['overview', 'users', 'activity', 'storage'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            className={`px-4 py-2 text-sm font-mono capitalize transition-colors ${
              activeTab === tab
                ? 'text-teal border-b-2 border-teal'
                : 'text-muted hover:text-off'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Version</div>
            <div className="text-xl font-heading font-bold">{info?.versionstring || 'Unknown'}</div>
            <div className="text-xs text-muted">{info?.edition}</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Users</div>
            <div className="text-xl font-heading font-bold">{storage?.num_users || 0}</div>
            <div className="text-xs text-muted">Total registered</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Files</div>
            <div className="text-xl font-heading font-bold">{storage?.num_files?.toLocaleString() || 0}</div>
            <div className="text-xs text-muted">Total files stored</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Storages</div>
            <div className="text-xl font-heading font-bold">{storage?.num_storages || 0}</div>
            <div className="text-xs text-muted">Configured storages</div>
          </div>
        </div>
      )}

      {activeTab === 'storage' && storage && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Local</div>
            <div className="text-xl font-heading font-bold">{storage.num_storages_local}</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Home</div>
            <div className="text-xl font-heading font-bold">{storage.num_storages_home}</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Other</div>
            <div className="text-xl font-heading font-bold">{storage.num_storages_other}</div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-mono text-muted uppercase tracking-wider">
                <th className="p-4">User</th>
                <th className="p-4">Status</th>
                <th className="p-4">Groups</th>
                <th className="p-4">Backend</th>
                <th className="p-4">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-line/50 hover:bg-panel-2/50">
                  <td className="p-4">
                    <div className="font-mono">{user.display_name}</div>
                    <div className="text-xs text-muted">{user.email || 'No email'}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-mono rounded ${user.enabled ? 'bg-green-500/20 text-green' : 'bg-red-500/20 text-red'}`}>
                      {user.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="p-4 text-sm">{user.groups.join(', ') || 'None'}</td>
                  <td className="p-4 text-sm font-mono text-muted">{user.backend}</td>
                  <td className="p-4 text-sm text-muted">
                    {user.last_login ? new Date(user.last_login * 1000).toLocaleString() : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'activity' && activity && (
        <div className="card overflow-hidden">
          <div className="space-y-3 p-4">
            {activity.activities.slice(0, 20).map((item, idx) => (
              <div key={idx} className="flex gap-3 p-3 rounded border border-line/50 hover:border-teal/50 transition-colors">
                <div className="text-teal font-mono text-sm">{item.app}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{item.subject}</div>
                  <div className="text-sm text-muted">{item.message}</div>
                </div>
                <div className="text-xs text-muted font-mono whitespace-nowrap">
                  {new Date(item.datetime).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}