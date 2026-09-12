import { useQuery } from '@tanstack/react-query';
import { getErrorMessage } from '@properfy/shared';
import { api } from '@/services/api';
import { formatAddressLabel } from '@/lib/address';
import type { Branch } from '../types';

export function useBranchById(tenantId: string | null, branchId: string | null) {
  return useQuery({
    queryKey: ['tenant-admins', tenantId, 'branches', branchId],
    queryFn: async (): Promise<Branch> => {
      const { data: resp, error } = await api.GET(
        '/v1/tenants/{tenantId}/branches/{branchId}',
        { params: { path: { tenantId: tenantId!, branchId: branchId! } } },
      );
      if (error) throw new Error(getErrorMessage(error, 'Request failed'));
      const item = resp.data;
      return {
        ...item,
        // The OpenAPI schema widens these two: the JSON column to `unknown` and
        // the enum to `string`. Narrow them to the domain shape; every other
        // field stays under the compiler's drift check via the spread.
        addressJson: (item.addressJson ?? null) as Record<string, unknown> | null,
        status: item.status as Branch['status'],
        address: formatAddressLabel(item.addressJson) ?? null,
      };
    },
    enabled: !!tenantId && !!branchId,
    staleTime: 0,
  });
}
