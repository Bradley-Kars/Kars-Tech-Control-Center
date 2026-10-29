import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar, type SidebarProps } from './Sidebar';

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  const props: SidebarProps = {
    onNavigate: vi.fn(),
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
    expect(screen.getByText('KTS')).toBeInTheDocument();
    expect(screen.getByText('Master Control')).toBeInTheDocument();
  });

  it('renders only Ticketing and Settings as linkable destinations', () => {
    renderSidebar();
    expect(screen.getByText('Ticketing')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('does not render removed fleet pages', () => {
    renderSidebar();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Unraid Server')).not.toBeInTheDocument();
    expect(screen.queryByText('Galaxy S24 Ultra')).not.toBeInTheDocument();
  });

  it('does not render Fleet Operations Hub subtitle', () => {
    renderSidebar();
    expect(screen.queryByText('Fleet Operations Hub')).not.toBeInTheDocument();
  });

  it('calls onNavigate when a nav item is clicked', () => {
    const onNavigate = vi.fn();
    renderSidebar({ onNavigate });
    fireEvent.click(screen.getByText('Ticketing'));
    expect(onNavigate).toHaveBeenCalledWith('/ticketing');
  });

  it('calls onToggleCollapse when collapse is clicked', () => {
    const onToggleCollapse = vi.fn();
    renderSidebar({ onToggleCollapse });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it('calls onToggleCollapse when expand is clicked while collapsed', () => {
    const onToggleCollapse = vi.fn();
    renderSidebar({ collapsed: true, onToggleCollapse });
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it('renders collapsed sidebar as icon-only rail', () => {
    renderSidebar({ collapsed: true });
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    expect(screen.queryByText('Ticketing')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });
});
