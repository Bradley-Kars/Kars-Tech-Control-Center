import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar, type SidebarProps } from './Sidebar';

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  const props: SidebarProps = {
    location: { pathname: '/dashboard' },
    onNavigate: vi.fn(),
    servers: [
      { id: 'unraid', name: 'Unraid Server', device_type: 'unraid', hostname: 'home-server' },
      { id: 'phone', name: 'Galaxy S24 Ultra', device_type: 'phone', hostname: 'bradleys-s24-ultra' },
    ],
    deviceStatus: { unraid: 'online', phone: 'online' },
    localStats: null,
    collapsed: false,
    onToggleCollapse: vi.fn(),
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <Sidebar {...props} />
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  it('renders KTS Master Control branding', () => {
    renderSidebar();
    expect(screen.getByText('KTS Master Control')).toBeInTheDocument();
    expect(screen.getByText('Fleet Operations Hub')).toBeInTheDocument();
  });

  it('renders device navigation items by default', () => {
    renderSidebar();
    expect(screen.getByText('This Machine')).toBeInTheDocument();
    expect(screen.getByText('Unraid Server')).toBeInTheDocument();
    expect(screen.getByText('Galaxy S24 Ultra')).toBeInTheDocument();
    expect(screen.getByText('ROG Ally')).toBeInTheDocument();
    expect(screen.queryByText('Senpai Laptop')).not.toBeInTheDocument();
  });

  it('hides service pages until Services group is expanded', () => {
    renderSidebar();
    expect(screen.queryByText('Nextcloud')).not.toBeInTheDocument();
    expect(screen.queryByText('Docker')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Services'));
    expect(screen.getByText('Docker')).toBeInTheDocument();
    expect(screen.getByText('Nextcloud')).toBeInTheDocument();
  });

  it('highlights the active page', () => {
    renderSidebar({ location: { pathname: '/device/unraid' } });
    const link = screen.getByText('Unraid Server').closest('a');
    expect(link).toHaveClass('bg-[var(--kts-brand-primary-bg)]');
  });

  it('calls onNavigate when a nav item is clicked', () => {
    const onNavigate = vi.fn();
    renderSidebar({ onNavigate });
    fireEvent.click(screen.getByText('This Machine'));
    expect(onNavigate).toHaveBeenCalledWith('/device/local');
  });

  it('calls onToggleCollapse when collapse is clicked', () => {
    const onToggleCollapse = vi.fn();
    renderSidebar({ onToggleCollapse });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it('renders collapsed sidebar without labels', () => {
    renderSidebar({ collapsed: true });
    expect(screen.queryByText('KTS Master Control')).not.toBeInTheDocument();
    expect(screen.queryByText('This Machine')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });
});
