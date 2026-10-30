import { useDetailQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/hooks/useAuth';

export interface InspectorMe {
  id: string;
  fullName: string | null;
  abn: string | null;
  dateOfBirth: string | null;
  insuranceFileKey: string | null;
  insuranceExpiresAt: string | null;
  policeCheckFileKey: string | null;
  policeCheckExpiresAt: string | null;
  insuranceMetaJson: { fileName?: string | null } | null;
  policeCheckMetaJson: { fileName?: string | null } | null;
  /**
   * Base address (F01-1). `/v1/inspectors/me` has no Fastify response schema, so
   * these are typed from what the use case returns (visibility applied server-side).
   * `address` is `unknown` because a legacy row may carry a non-conforming shape;
   * the card parses it with `inspectorBaseAddressSchema` before pre-filling.
   * `baseLat == null` ⇒ no coordinates ⇒ the base-address banner is shown.
   */
  address?: unknown | null;
  baseLat?: number | null;
  baseLng?: number | null;
  baseGeocodedAt?: string | null;
  /**
   * Aggregate reputation. Optional so an app deployed ahead of the API keeps
   * rendering; `average` is null — never 0 — when there are no responses.
   */
  rating?: {
    average: number | null;
    responseCount: number;
    doneServicesCount: number;
  };
}

/**
 * The inspector's own record.
 *
 * Extracted so the profile card and the details card share one request instead
 * of issuing two — the query key and options are deliberately identical to what
 * `InspectorDetailsCard` used inline, so cache behaviour is unchanged.
 */
export function useInspectorMe() {
  const { user } = useAuth();

  return useDetailQuery<InspectorMe>(['inspector', 'me', user?.id], '/v1/inspectors/me', {
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
