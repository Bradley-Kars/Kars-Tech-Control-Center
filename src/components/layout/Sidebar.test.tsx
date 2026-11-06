import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar, type SidebarProps } from './Sidebar';
import { SIDEBAR_GROUPS } from '../../config/nav';

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

const GROUP_LABELS: Array<string> = SIDEBAR_GROUPS.map((g) => g.label);

const LINKS: Array<[label: string, path: string]> = SIDEBAR_GROUPS.flatMap((g) =>
  g.pages.map((p) => [p.label, p.href] as [string, string]),
);

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

  it.each(GROUP_LABELS)('renders the %s collapsible group header', (label) => {
    renderSidebar();
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
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
    renderSidebar({}, ['/device/local']);
    expect(screen.getByText('This Machine')).toHaveClass(/bg-\[var\(--kts-brand-primary-bg\)\]/);
  });

  it('collapses and expands a section', () => {
    renderSidebar();
    expect(screen.getByText('Fleet')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fleet' }));
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fleet' }));
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
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

  it('does not render Lidarr as a top-level link', () => {
    renderSidebar();
    expect(screen.queryByText('Lidarr')).not.toBeInTheDocument();
  });

  it('does not render Sonarr as a top-level link', () => {
    renderSidebar();
    expect(screen.queryByText('Sonarr')).not.toBeInTheDocument();
  });

  it('does not render Radarr as a top-level link', () => {
    renderSidebar();
    expect(screen.queryByText('Radarr')).not.toBeInTheDocument();
  });

  it('does not render a standalone Services group', () => {
    renderSidebar();
    expect(screen.queryByText('Services')).not.toBeInTheDocument();
  });

  it('does not render a standalone More Services group', () => {
    renderSidebar();
    expect(screen.queryByText('More Services')).not.toBeInTheDocument();
  });

  it('renders a single Arr link under Services', () => {
    renderSidebar();
    expect(screen.getByText('Arr')).toBeInTheDocument();
    expect(screen.getByText('Arr')).toHaveAttribute('href', '/service/arr');
  });
});
