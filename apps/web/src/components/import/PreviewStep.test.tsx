import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewStep } from './PreviewStep';

const COLUMNS = ['name', 'email', 'phone'];
const ROWS = [
  { name: 'Alice', email: 'alice@test.com', phone: '555-0001' },
  { name: 'Bob', email: 'bob@test.com', phone: '555-0002' },
  { name: '', email: 'charlie@test.com', phone: '555-0003' },
];

describe('PreviewStep', () => {
  it('renders column headers', () => {
    render(
      <PreviewStep columns={COLUMNS} rows={ROWS} errors={[]} totalRows={3} />,
    );

    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('email')).toBeInTheDocument();
    expect(screen.getByText('phone')).toBeInTheDocument();
  });

  it('renders preview rows', () => {
    render(
      <PreviewStep columns={COLUMNS} rows={ROWS} errors={[]} totalRows={3} />,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
  });

  it('highlights error rows', () => {
    const errors = [{ row: 3, column: 'name', message: 'Name is required' }];
    render(
      <PreviewStep columns={COLUMNS} rows={ROWS} errors={errors} totalRows={3} />,
    );

    const errorRow = screen.getByTestId('preview-row-3');
    expect(errorRow.className).toContain('bg-red-50');

    const normalRow = screen.getByTestId('preview-row-1');
    expect(normalRow.className).not.toContain('bg-red-50');
  });

  it('shows summary with counts', () => {
    const errors = [
      { row: 3, column: 'name', message: 'Name is required' },
    ];
    render(
      <PreviewStep columns={COLUMNS} rows={ROWS} errors={errors} totalRows={3} />,
    );

    expect(screen.getByText('3 rows parsed')).toBeInTheDocument();
    expect(screen.getByText('1 errors found')).toBeInTheDocument();
    expect(screen.getByText('2 valid rows ready for import')).toBeInTheDocument();
  });

  it('shows no errors message when all rows are valid', () => {
    render(
      <PreviewStep columns={COLUMNS} rows={ROWS} errors={[]} totalRows={3} />,
    );

    expect(screen.getByText('No errors found')).toBeInTheDocument();
  });

  it('shows error details list', () => {
    const errors = [
      { row: 3, column: 'name', message: 'Name is required' },
    ];
    render(
      <PreviewStep columns={COLUMNS} rows={ROWS} errors={errors} totalRows={3} />,
    );

    expect(screen.getByText('Error Details')).toBeInTheDocument();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });
});
