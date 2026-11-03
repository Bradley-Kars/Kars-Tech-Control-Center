import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table } from './Table';

function renderTable() {
  const columns = [
    { key: 'name', header: 'Name', minWidth: '120px' },
    { key: 'status', header: 'Status', minWidth: '100px' },
  ];
  const data = [
    { name: 'Long container name that gets truncated in the cell', status: 'running' },
    { name: 'Short', status: 'stopped' },
  ];
  return render(
    <Table columns={columns} data={data} keyAccessor={(row) => row.name} />
  );
}

describe('Table (TABLE-001)', () => {
  it('exposes the full cell text as a title attribute on the <td> for truncated cells', () => {
    renderTable();
    const longCell = screen.getByText(
      'Long container name that gets truncated in the cell'
    );
    const td = longCell.closest('td');
    expect(td).not.toBeNull();
    expect(td).toHaveAttribute(
      'title',
      'Long container name that gets truncated in the cell'
    );
  });

  it('sets a title attribute on every string cell, not only long ones', () => {
    renderTable();
    const shortCell = screen.getByText('Short');
    const td = shortCell.closest('td');
    expect(td).not.toBeNull();
    expect(td).toHaveAttribute('title', 'Short');
  });
});
