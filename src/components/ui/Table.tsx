import { type ReactNode, useState } from 'react';
import { IconButton } from './Button';
import { SkeletonTable } from './Skeleton';
import { Checkbox } from './Checkbox';
import { Select } from './Input';

export type ColumnAlign = 'left' | 'center' | 'right';
export type SortDirection = 'asc' | 'desc' | null;

export interface Column<T = any> {
  key: string;
  header: string;
  accessor?: string | ((row: T) => ReactNode);
  cell?: (row: T, value: any) => ReactNode;
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  align?: ColumnAlign;
  headerAlign?: ColumnAlign;
  sortable?: boolean;
  filterable?: boolean;
  renderHeader?: () => ReactNode;
}

export interface TableProps<T = any> {
  columns: Column<T>[];
  data: T[];
  keyAccessor: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  striped?: boolean;
  hoverable?: boolean;
  bordered?: boolean;
  compact?: boolean;
  selectable?: boolean;
  onSelectionChange?: (selectedKeys: string[]) => void;
  defaultSelectedKeys?: string[];
  sortColumn?: string;
  sortDirection?: SortDirection;
  onSort?: (column: string, direction: SortDirection) => void;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  };
  className?: string;
  style?: React.CSSProperties;
  rowClassName?: (row: T, index: number) => string;
}

export function Table<T = any>({
  columns,
  data,
  keyAccessor,
  loading = false,
  emptyMessage = 'No data',
  emptyIcon,
  striped = true,
  hoverable = true,
  bordered = false,
  compact = false,
  selectable = false,
  onSelectionChange,
  defaultSelectedKeys = [],
  sortColumn,
  sortDirection,
  onSort,
  pagination,
  className = '',
  style,
  rowClassName,
}: TableProps<T>) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(defaultSelectedKeys));

  // Handle sorting
  const handleSort = (columnKey: string) => {
    if (!onSort) return;

    let newDirection: SortDirection = 'asc';
    if (sortColumn === columnKey && sortDirection === 'asc') newDirection = 'desc';
    else if (sortColumn === columnKey && sortDirection === 'desc') newDirection = null;

    onSort(columnKey, newDirection);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allKeys = data.map(keyAccessor);
      setSelectedKeys(new Set(allKeys));
      onSelectionChange?.(allKeys);
    } else {
      setSelectedKeys(new Set());
      onSelectionChange?.([]);
    }
  };

  const handleSelectRow = (key: string, checked: boolean) => {
    const newSelected = new Set(selectedKeys);
    if (checked) newSelected.add(key);
    else newSelected.delete(key);
    setSelectedKeys(newSelected);
    onSelectionChange?.(Array.from(newSelected));
  };

  const isRowSelected = (key: string) => selectedKeys.has(key);
  const allSelected = data.length > 0 && data.every((row) => selectedKeys.has(keyAccessor(row)));
  const someSelected = data.length > 0 && data.some((row) => selectedKeys.has(keyAccessor(row)));

  // Show skeleton while loading
  if (loading) {
    return (
      <div className={['table-container', className].filter(Boolean).join(' ')} style={style}>
        <SkeletonTable columns={columns.length} rows={5} />
        {pagination && <TablePagination {...pagination} />}
      </div>
    );
  }

  return (
    <div className={['table-container overflow-x-auto', className].filter(Boolean).join(' ')} style={style}>
      <div style={{ overflowX: 'auto' }}>
        <table
          className="w-full border-collapse"
          style={{
            fontSize: compact ? 'var(--kts-font-size-xs)' : 'var(--kts-font-size-sm)',
            fontFamily: 'var(--kts-font-sans)',
          }}
        >
          <thead>
            <tr
              style={{
                background: 'var(--kts-bg-tertiary)',
                borderBottom: bordered ? '1px solid var(--kts-border-default)' : 'none',
              }}
            >
              {selectable && (
                <th
                  className="px-3 py-2 text-left"
                  style={{
                    width: '40px',
                    padding: compact ? 'var(--kts-space-2) var(--kts-space-3)' : 'var(--kts-space-3) var(--kts-space-4)',
                    borderRight: bordered ? '1px solid var(--kts-border-default)' : 'none',
                  }}
                >
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected && !allSelected}
                      onChange={handleSelectAll as any}
                      disabled={data.length === 0}
                    />
                </th>
              )}
              {columns.map((col, i) => (
                <th
                  key={col.key}
                  className={[
                    'font-[var(--kts-font-sans)] font-medium uppercase tracking-[0.08em] text-[var(--kts-text-secondary)]',
                    col.headerAlign === 'center' && 'text-center',
                    col.headerAlign === 'right' && 'text-right',
                    col.sortable && 'cursor-pointer select-none hover:text-[var(--kts-brand-primary)]',
                  ].filter(Boolean).join(' ')}
                  style={{
                    padding: compact ? 'var(--kts-space-2) var(--kts-space-3)' : 'var(--kts-space-3) var(--kts-space-4)',
                    width: col.width,
                    minWidth: col.minWidth,
                    maxWidth: col.maxWidth,
                    borderRight: bordered && i < columns.length - 1 ? '1px solid var(--kts-border-default)' : 'none',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  aria-sort={sortColumn === col.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <div className="flex items-center justify-between gap-1">
                    {col.renderHeader ? col.renderHeader() : col.header}
                    {col.sortable && (
                      <span className="inline-flex items-center" style={{ fontSize: '10px' }}>
                        {sortColumn === col.key ? (
                          sortDirection === 'asc' ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                          )
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}><polyline points="18 15 12 9 6 15" /></svg>
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="text-center py-12">
                  <div className="flex flex-col items-center gap-3 text-[var(--kts-text-tertiary)]">
                    {emptyIcon || (
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    )}
                    <span style={{ fontSize: 'var(--kts-font-size-base)' }}>{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => {
                const rowKey = keyAccessor(row);
                const isSelected = isRowSelected(rowKey);

                return (
                  <tr
                    key={rowKey}
                    className={[
                      'transition-colors duration-[var(--kts-motion-fast)]',
                      striped && rowIndex % 2 === 1 && 'bg-[var(--kts-bg-tertiary)]',
                      hoverable && 'hover:bg-[var(--kts-interactive-hover)]',
                      selectable && (isSelected ? 'bg-[var(--kts-brand-primary-bg)]' : ''),
                      rowClassName?.(row, rowIndex),
                    ].filter(Boolean).join(' ')}
                    style={{
                      borderBottom: bordered ? '1px solid var(--kts-border-default)' : 'none',
                    }}
                  >
                    {selectable && (
                      <td
                        className="px-3 py-2"
                        style={{
                          padding: compact ? 'var(--kts-space-2) var(--kts-space-3)' : 'var(--kts-space-3) var(--kts-space-4)',
                          borderRight: bordered ? '1px solid var(--kts-border-default)' : 'none',
                        }}
                      >
                      <Checkbox
                        checked={isSelected}
                        onChange={((checked: boolean) => handleSelectRow(rowKey, checked)) as any}
                      />
                      </td>
                    )}
                    {columns.map((col, i) => {
                      const rawValue = col.accessor
                        ? typeof col.accessor === 'function'
                          ? col.accessor(row)
                          : (row as any)[col.accessor]
                        : (row as any)[col.key];
                      const cellContent = col.cell ? col.cell(row, rawValue) : rawValue;

                      return (
                        <td
                          key={col.key}
                          className={[
                            col.align === 'center' && 'text-center',
                            col.align === 'right' && 'text-right',
                            'truncate',
                          ].filter(Boolean).join(' ')}
                          style={{
                            padding: compact ? 'var(--kts-space-2) var(--kts-space-3)' : 'var(--kts-space-3) var(--kts-space-4)',
                            borderRight: bordered && i < columns.length - 1 ? '1px solid var(--kts-border-default)' : 'none',
                          width: col.width,
                            minWidth: col.minWidth,
                            maxWidth: col.maxWidth,
                          }}
                          >
                          {typeof cellContent === 'string' ? (
                            <span title={String(cellContent)}>{cellContent}</span>
                          ) : (
                            <span>{cellContent}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {pagination && <TablePagination {...pagination} />}
    </div>
  );
}

interface TablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

function TablePagination({ page, pageSize, total, onPageChange, onPageSizeChange }: TablePaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div
      className="flex items-center justify-between gap-4"
      style={{
        padding: 'var(--kts-space-3) var(--kts-space-4)',
        borderTop: '1px solid var(--kts-border-default)',
        background: 'var(--kts-bg-tertiary)',
        fontSize: 'var(--kts-font-size-sm)',
        color: 'var(--kts-text-secondary)',
      }}
    >
      <div className="flex items-center gap-2">
        <span>Showing {start}–{end} of {total}</span>
        <Select
          value={String(pageSize)}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          size="xs"
          options={[
            { value: '10', label: '10' },
            { value: '25', label: '25' },
            { value: '50', label: '50' },
            { value: '100', label: '100' },
          ]}
        />
      </div>
      <div className="flex items-center gap-1">
        <IconButton
          variant="ghost"
          size="xs"
          aria-label="First page"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 18 11 12 17 6" />
            <line x1="6" y1="18" x2="6" y2="6" />
          </svg>
        </IconButton>
        <IconButton
          variant="ghost"
          size="xs"
          aria-label="Previous page"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </IconButton>
        <span className="px-2 font-[var(--kts-font-mono)]" style={{ minWidth: '40px', textAlign: 'center' }}>
          {page} / {totalPages}
        </span>
        <IconButton
          variant="ghost"
          size="xs"
          aria-label="Next page"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </IconButton>
        <IconButton
          variant="ghost"
          size="xs"
          aria-label="Last page"
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 18 13 12 7 6" />
            <line x1="18" y1="18" x2="18" y2="6" />
          </svg>
        </IconButton>
      </div>
    </div>
  );
}
