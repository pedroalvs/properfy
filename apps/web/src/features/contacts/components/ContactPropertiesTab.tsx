import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { RowActions } from '@/components/data/RowActions';
import { useContactProperties } from '../hooks/useContactProperties';
import type { ContactPropertyAggregate } from '../types';

interface ContactPropertiesTabProps {
  contactId: string;
  /** Lazy fetch: tab activates this only when visible (NFR-103/104). */
  enabled?: boolean;
}

export function ContactPropertiesTab({ contactId, enabled }: ContactPropertiesTabProps) {
  const navigate = useNavigate();
  const { data, isLoading, isError, errorMessage, refetch, pagination } =
    useContactProperties(contactId, { enabled });

  const handleView = useCallback(
    (row: ContactPropertyAggregate) => {
      navigate(`/properties/${row.propertyId}`);
    },
    [navigate],
  );

  const columns: DataTableColumn<ContactPropertyAggregate>[] = [
    {
      key: 'propertyCode',
      label: 'Code',
      width: '110px',
    },
    {
      key: 'street',
      label: 'Address',
      render: (row) => <>{row.street}, {row.suburb}</>,
    },
    {
      key: 'postcode',
      label: 'Postcode',
      width: '100px',
    },
    {
      key: 'state',
      label: 'State',
      width: '90px',
    },
    {
      key: 'appointmentCount',
      label: 'Appointments',
      width: '130px',
    },
    {
      key: 'isPrimaryInActiveAppointment',
      label: 'Primary',
      width: '100px',
      render: (row) => row.isPrimaryInActiveAppointment ? (
        <span
          className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
          style={{ backgroundColor: 'var(--color-status-scheduled)', color: 'var(--color-text-primary)' }}
          aria-label="Primary contact in an active appointment"
        >
          Primary
        </span>
      ) : <span>—</span>,
    },
    {
      key: 'actions',
      label: '',
      width: '60px',
      render: (row) => (
        <RowActions
          actions={[
            {
              icon: 'mdi-eye-outline',
              label: 'Open property',
              onClick: () => handleView(row),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable<ContactPropertyAggregate>
      columns={columns}
      data={data}
      loading={isLoading}
      error={isError ? (errorMessage ?? 'Failed to load properties') : undefined}
      onRetryError={refetch}
      pagination={pagination}
      keyExtractor={(row) => row.propertyId}
    />
  );
}
