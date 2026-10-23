import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useServers } from '../hooks';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { DockerPage } from '../components/docker/DockerPage';
import { StoragePage } from '../components/storage/StoragePage';
import { SystemPage } from '../components/system/SystemPage';
import { NetworkPage } from '../components/network/NetworkPage';
import { NextcloudPage } from '../components/nextcloud/NextcloudPage';
import { LidarrPage } from '../components/lidarr/LidarrPage';
import { HomeAssistantPage } from '../components/homeassistant/HomeAssistantPage';
import { MySpeedPage } from '../components/myspeed/MySpeedPage';
import { AdGuardPage } from '../components/adguard/AdGuardPage';
import { useNavigate } from 'react-router-dom';
import type { PageId } from '../lib/serviceRegistry';

const SERVICE_META: Record<string, { label: string; icon: string; description: string }> = {
  docker: { label: 'Docker', icon: '🐳', description: 'Container management' },
  storage: { label: 'Storage', icon: '💾', description: 'Array, disks & shares' },
  system: { label: 'System', icon: '⚙', description: 'CPU, memory & processes' },
  network: { label: 'Network', icon: '🌐', description: 'Interfaces & Tailscale' },
  nextcloud: { label: 'Nextcloud', icon: '☁', description: 'File sync & share' },
  lidarr: { label: 'Lidarr', icon: '🎵', description: 'Music collection' },
  homeassistant: { label: 'Home Assistant', icon: '🏠', description: 'Home automation' },
  myspeed: { label: 'MySpeed', icon: '📊', description: 'Speed test history' },
  adguard: { label: 'AdGuard Home', icon: '🛡', description: 'DNS filtering' },
};

export function ServicePage() {
  const { serviceId } = useParams();
  const { servers, loading } = useServers();
  const navigate = useNavigate();

  const unraidServer = useMemo(
    () => servers.find((s) => s.device_type === 'unraid') ?? servers.find((s) => s.device_type !== 'phone') ?? null,
    [servers],
  );

  const meta = serviceId ? SERVICE_META[serviceId] : undefined;

  if (!serviceId || !meta) {
    return (
      <div className="space-y-6">
        <h1 className="font-[var(--kts-font-heading)] font-bold" style={{ fontSize: 'var(--kts-font-size-4xl)', letterSpacing: '-0.02em' }}>
          Service not found
        </h1>
        <p className="text-[var(--kts-text-secondary)]">
          No service named “{serviceId}”. <Link className="text-[var(--kts-text-link)]" to="/dashboard">Back to dashboard</Link>
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 rounded-[var(--kts-radius-base)] bg-[var(--kts-bg-tertiary)] animate-pulse" />
        <div className="h-64 rounded-[var(--kts-radius-lg)] bg-[var(--kts-bg-tertiary)] animate-pulse" />
      </div>
    );
  }

  if (!unraidServer) {
    return (
      <div className="space-y-6">
        <ServiceHeader serviceId={serviceId} />
        <Card>
          <div className="p-6 flex flex-col gap-3">
            <Badge variant="warning" size="sm">Server required</Badge>
            <p className="text-[var(--kts-text-secondary)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
              {meta.label} runs on the Unraid server, and no server is configured yet.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // Legacy setPage mapper: old page ids → new routes
  const setPage = (page: PageId) => {
    if (page === 'dashboard') navigate('/dashboard');
    else if (page === 'phone') navigate('/device/phone');
    else if (page === 'steamdeck') navigate('/device/ally');
    else navigate(`/service/${page}`);
  };

  let body: React.ReactNode;
  switch (serviceId) {
    case 'docker':
      body = <DockerPage server={unraidServer} setPage={setPage} />;
      break;
    case 'storage':
      body = <StoragePage server={unraidServer} />;
      break;
    case 'system':
      body = <SystemPage server={unraidServer} />;
      break;
    case 'network':
      body = <NetworkPage server={unraidServer} />;
      break;
    case 'nextcloud':
      body = <NextcloudPage server={unraidServer} />;
      break;
    case 'lidarr':
      body = <LidarrPage server={unraidServer} />;
      break;
    case 'homeassistant':
      body = <HomeAssistantPage server={unraidServer} />;
      break;
    case 'myspeed':
      body = <MySpeedPage server={unraidServer} />;
      break;
    case 'adguard':
      body = <AdGuardPage server={unraidServer} />;
      break;
    default:
      body = null;
  }

  return (
    <div className="space-y-6">
      <ServiceHeader serviceId={serviceId} />
      {body}
    </div>
  );
}

function ServiceHeader({ serviceId }: { serviceId: string }) {
  const meta = SERVICE_META[serviceId];
  if (!meta) return null;
  return (
    <div className="flex items-center gap-4">
      <div
        className="flex items-center justify-center"
        style={{
          width: '48px',
          height: '48px',
          borderRadius: 'var(--kts-radius-base)',
          background: 'var(--kts-brand-primary-bg)',
          fontSize: '24px',
        }}
        aria-hidden="true"
      >
        {meta.icon}
      </div>
      <div>
        <h1 className="font-[var(--kts-font-heading)] font-bold" style={{ fontSize: 'var(--kts-font-size-3xl)', letterSpacing: '-0.02em' }}>
          {meta.label}
        </h1>
        <p className="text-[var(--kts-text-secondary)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
          {meta.description}
        </p>
      </div>
    </div>
  );
}
