import { useState, useEffect } from 'react';
import {
  getLidarrStatus,
  getLidarrArtists,
  getLidarrAlbums,
  getLidarrWanted,
  getLidarrDiskspace,
  lidarrRefreshArtist,
  lidarrSearchMissing,
} from '../../lib/tauri-commands';
import type { ServerConfig } from '../../lib/types';

interface LidarrSystemStatus {
  version: string;
  buildTime: string;
  isDebug: boolean;
  isProduction: boolean;
  isAdmin: boolean;
  startupPath: string;
  appData: string;
  osName: string;
  osVersion: string;
  isLinux: boolean;
  isOsx: boolean;
  isWindows: boolean;
  branch: string;
  authentication: string;
  urlBase: string;
  instanceName: string;
}

interface LidarrArtist {
  id: number;
  foreignArtistId: string;
  artistName: string;
  monitored: boolean;
  metadataProfileId: number;
  qualityProfileId: number;
  rootFolderPath: string;
  addOptions?: { searchForNewAlbum: boolean; searchForMissingAlbum: boolean; searchForCutoffUnmetAlbum: boolean };
  tags: number[];
}

interface LidarrAlbum {
  id: number;
  foreignAlbumId: string;
  artistId: number;
  title: string;
  albumType: string;
  status: string;
  monitored: boolean;
  releaseDate: string;
  genres: string[];
  statistics?: {
    trackCount: number;
    trackFileCount: number;
    sizeOnDisk: number;
    percentOfTracks: number;
  };
}

interface LidarrWantedMissing {
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: string;
  totalRecords: number;
  records: Record<string, unknown>[];
}

interface LidarrDiskSpace {
  path: string;
  label?: string;
  freeSpace: number;
  totalSpace: number;
}

export function LidarrPage({ server }: { server: ServerConfig }) {
  const [status, setStatus] = useState<LidarrSystemStatus | null>(null);
  const [artists, setArtists] = useState<LidarrArtist[]>([]);
  const [albums, setAlbums] = useState<LidarrAlbum[]>([]);
  const [wanted, setWanted] = useState<LidarrWantedMissing | null>(null);
  const [diskspace, setDiskspace] = useState<LidarrDiskSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'artists' | 'albums' | 'wanted' | 'diskspace'>('overview');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statusRes, artistsRes, albumsRes, wantedRes, diskspaceRes] = await Promise.allSettled([
        getLidarrStatus(server.id),
        getLidarrArtists(server.id),
        getLidarrAlbums(server.id),
        getLidarrWanted(server.id),
        getLidarrDiskspace(server.id),
      ]);
      if (statusRes.status === 'fulfilled') setStatus(statusRes.value);
      if (artistsRes.status === 'fulfilled') setArtists(artistsRes.value);
      if (albumsRes.status === 'fulfilled') setAlbums(albumsRes.value);
      if (wantedRes.status === 'fulfilled') setWanted(wantedRes.value);
      if (diskspaceRes.status === 'fulfilled') setDiskspace(diskspaceRes.value);
    } catch (err) {
      console.error('Failed to fetch Lidarr data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [server.id]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleRefreshArtist = async (artistId: number) => {
    try {
      await lidarrRefreshArtist(server.id, artistId);
      fetchData();
    } catch (err) {
      console.error('Failed to refresh artist:', err);
    }
  };

  const handleSearchMissing = async (artistId: number) => {
    try {
      await lidarrSearchMissing(server.id, artistId);
      fetchData();
    } catch (err) {
      console.error('Failed to search missing albums:', err);
    }
  };

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
        <h1 className="text-2xl font-heading font-bold">Lidarr</h1>
      </div>

      <div className="flex gap-2 border-b border-line mb-4 overflow-x-auto">
        {['overview', 'artists', 'albums', 'wanted', 'diskspace'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            className={`px-4 py-2 text-sm font-mono capitalize transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'text-teal border-b-2 border-teal'
                : 'text-muted hover:text-off'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && status && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Version</div>
            <div className="text-xl font-heading font-bold">{status.version}</div>
            <div className="text-xs text-muted">Branch: {status.branch}</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Instance</div>
            <div className="text-xl font-heading font-bold">{status.instanceName}</div>
            <div className="text-xs text-muted">{status.osName} {status.osVersion}</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Artists</div>
            <div className="text-xl font-heading font-bold">{artists.length}</div>
            <div className="text-xs text-muted">Total tracked</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Albums</div>
            <div className="text-xl font-heading font-bold">{albums.length}</div>
            <div className="text-xs text-muted">Total albums</div>
          </div>
        </div>
      )}

      {activeTab === 'artists' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-mono text-muted uppercase tracking-wider">
                <th className="p-4">Artist</th>
                <th className="p-4">Monitored</th>
                <th className="p-4">Albums</th>
                <th className="p-4">Root Folder</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {artists.map((artist) => (
                <tr key={artist.id} className="border-b border-line/50 hover:bg-panel-2/50">
                  <td className="p-4 font-mono">{artist.artistName}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-mono rounded ${artist.monitored ? 'bg-green-500/20 text-green' : 'bg-muted/20 text-muted'}`}>
                      {artist.monitored ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="p-4 text-sm">
                    {albums.filter(a => a.artistId === artist.id).length}
                  </td>
                  <td className="p-4 text-sm text-muted truncate max-w-xs">{artist.rootFolderPath}</td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRefreshArtist(artist.id)}
                        className="btn btn-ghost btn-sm btn-xs"
                      >
                        Refresh
                      </button>
                      <button
                        onClick={() => handleSearchMissing(artist.id)}
                        className="btn btn-ghost btn-sm btn-xs"
                      >
                        Search
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'albums' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-mono text-muted uppercase tracking-wider">
                <th className="p-4">Album</th>
                <th className="p-4">Artist</th>
                <th className="p-4">Status</th>
                <th className="p-4">Release Date</th>
                <th className="p-4">Completion</th>
              </tr>
            </thead>
            <tbody>
              {albums.slice(0, 50).map((album) => {
                const artist = artists.find(a => a.id === album.artistId);
                const pct = album.statistics?.percentOfTracks || 0;
                return (
                  <tr key={album.id} className="border-b border-line/50 hover:bg-panel-2/50">
                    <td className="p-4 font-mono">{album.title}</td>
                    <td className="p-4 text-sm">{artist?.artistName || 'Unknown'}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs font-mono rounded ${
                        album.status === 'released' ? 'bg-green-500/20 text-green' :
                        album.status === 'announced' ? 'bg-amber-500/20 text-amber' :
                        'bg-muted/20 text-muted'
                      }`}>
                        {album.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-muted">{album.releaseDate}</td>
                    <td className="p-4">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted mt-1">{pct.toFixed(1)}%</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'wanted' && wanted && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-line">
            <div className="text-sm font-mono text-muted">Showing {wanted.records.length} of {wanted.totalRecords} missing albums</div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-mono text-muted uppercase tracking-wider">
                <th className="p-4">Album</th>
                <th className="p-4">Artist</th>
                <th className="p-4">Release Date</th>
                <th className="p-4">Monitored</th>
              </tr>
            </thead>
            <tbody>
              {wanted.records.map((record: Record<string, unknown>) => {
                const title = (record.title as string) || '';
                const releaseDate = (record.releaseDate as string) || '';
                const monitored = record.monitored as boolean;
                const artist = record.artist as Record<string, unknown> | undefined;
                const artistName = (artist?.artistName as string) || 'Unknown';
                return (
                  <tr key={record.id as number} className="border-b border-line/50 hover:bg-panel-2/50">
                    <td className="p-4 font-mono">{title}</td>
                    <td className="p-4 text-sm">{artistName}</td>
                    <td className="p-4 text-sm text-muted">{releaseDate}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs font-mono rounded ${monitored ? 'bg-green-500/20 text-green' : 'bg-muted/20 text-muted'}`}>
                        {monitored ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'diskspace' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {diskspace.map((disk, idx) => (
            <div key={idx} className="card p-4">
              <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1 truncate">{disk.path}</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Free</span>
                  <span className="font-mono text-green">{formatBytes(disk.freeSpace)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Total</span>
                  <span className="font-mono">{formatBytes(disk.totalSpace)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-teal transition-all"
                    style={{ width: `${disk.totalSpace > 0 ? ((disk.totalSpace - disk.freeSpace) / disk.totalSpace) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
