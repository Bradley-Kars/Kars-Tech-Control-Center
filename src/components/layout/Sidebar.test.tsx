import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar, type SidebarProps } from './Sidebar';

function renderSidebar(overrides: Partial<SidebarProps> = {}, initialEntries: string[] = ['/']) {
  const props: SidebarProps = {
    onNavigate: vi.fn(),
    collapsed: false,
    onToggleCollapse: vi.fn(),
    ...overrides,
  };
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Sidebar {...props} />
    </MemoryRouter>
  );
}

const LINKS: Array<[label: string, path: string]> = [
  ['Docker', '/service/docker'],
  ['Storage', '/service/storage'],
  ['System', '/service/system'],
  ['Network', '/service/network'],
  ['Arr', '/service/arr'],
  ['Home Assistant', '/service/homeassistant'],
  ['Nextcloud', '/service/nextcloud'],
  ['AdGuard', '/service/adguard'],
  ['Ticketing', '/ticketing'],
  ['Hermes', '/chat'],
  ['Settings', '/settings'],
];

const GROUPS = ['Services', 'Arr', 'More Services', 'Business', 'Hermes', 'Settings'];

describe('Sidebar', () => {
  it('renders KTS Master Control branding', () => {
    renderSidebar();
    expect(screen.getByText('KTS')).toBeInTheDocument();
    expect(screen.getByText('Master Control')).toBeInTheDocument();
  });

  it('renders the KTS logo image in the expanded sidebar header', () => {
    renderSidebar();
    expect(screen.getByAltText('KTS Master Control logo')).toBeInTheDocument();
  });

  it('keeps the KTS logo mark visible in the collapsed rail', () => {
    renderSidebar({ collapsed: true });
    expect(screen.getByAltText('KTS Master Control logo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it.each(GROUPS)('renders the %s collapsible group header', (group) => {
    renderSidebar();
    expect(screen.getByRole('button', { name: group })).toBeInTheDocument();
  });

  it.each(LINKS)('renders the %s link and navigates to %s', (label, path) => {
    const onNavigate = vi.fn();
    renderSidebar({ onNavigate });
    const link = screen.getByRole('link', { name: label });
    expect(link).toHaveAttribute('href', path);
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith(path);
  });

  it('highlights the active route', () => {
    renderSidebar({}, ['/service/system']);
    expect(screen.getByRole('link', { name: 'System' })).toHaveClass(/bg-\[var\(--kts-brand-primary-bg\)\]/);
  });

  it('collapses and expands a section', () => {
    renderSidebar();
    expect(screen.getByText('Docker')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Services' }));
    expect(screen.queryByText('Docker')).not.toBeInTheDocument();
    expect(screen.queryByText('Storage')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Services' }));
    expect(screen.getByText('Docker')).toBeInTheDocument();
  });

  it('renders collapsed sidebar as icon-only rail (labels hidden)', () => {
    const { container } = renderSidebar({ collapsed: true });
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    for (const [label] of LINKS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    // Icons still render for every link.
    expect(container.querySelectorAll('svg.lucide').length).toBeGreaterThan(0);
  });

  it('calls onToggleCollapse when expand is clicked while collapsed', () => {
    const onToggleCollapse = vi.fn();
    renderSidebar({ collapsed: true, onToggleCollapse });
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it('calls onToggleCollapse when collapse is clicked while expanded', () => {
    const onToggleCollapse = vi.fn();
    renderSidebar({ onToggleCollapse });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it('does not render MySpeed anywhere', () => {
    renderSidebar();
    expect(screen.queryByText('MySpeed')).not.toBeInTheDocument();
  });
});
