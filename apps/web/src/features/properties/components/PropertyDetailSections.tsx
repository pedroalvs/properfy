import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { GEOCODING_STATUS_MAP } from '@/lib/status-colors';
import { PropertyTypeChip } from './PropertyTypeChip';
import type { PropertyDetail } from '../types';

interface PropertyDetailSectionsProps {
  property: PropertyDetail;
}

function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

export function PropertyDetailSections({ property }: PropertyDetailSectionsProps) {
  const geocodingStyle = GEOCODING_STATUS_MAP[property.geocodingStatus];

  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Identificação">
        <DetailRow label="Código" value={property.propertyCode} />
        <DetailRow label="Tipo" value={<PropertyTypeChip type={property.type} />} />
        <DetailRow label="Filial" value={property.branchName} />
      </FormSection>

      <FormSection title="Endereço">
        <DetailRow label="Logradouro" value={property.street} />
        <DetailRow label="Complemento" value={property.addressLine2} />
        <DetailRow label="Bairro" value={property.suburb} />
        <DetailRow label="CEP" value={property.postcode} />
        <DetailRow label="Estado" value={property.state} />
        <DetailRow label="País" value={property.country} />
      </FormSection>

      <FormSection title="Geocodificação">
        <DetailRow
          label="Status"
          value={
            <span
              className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
              style={{ backgroundColor: geocodingStyle.bg, color: geocodingStyle.text }}
            >
              {geocodingStyle.label}
            </span>
          }
        />
        <DetailRow label="Latitude" value={property.latitude?.toString()} />
        <DetailRow label="Longitude" value={property.longitude?.toString()} />
      </FormSection>

      {property.notes && (
        <FormSection title="Observações">
          <DetailRow label="Notas" value={property.notes} />
        </FormSection>
      )}

      <FormSection title="Registro">
        <DetailRow label="Criado em" value={formatDateTimeBR(property.createdAt)} />
        <DetailRow label="Atualizado em" value={formatDateTimeBR(property.updatedAt)} />
      </FormSection>
    </div>
  );
}
