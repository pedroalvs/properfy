import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { formatAddressLabel } from '@/lib/address';
import type { Branch } from '../types';

export function useBranchById(tenantId: string | null, branchId: string | null) {
  return useQuery({
    queryKey: ['tenant-admins', tenantId, 'branches', branchId],
    queryFn: async (): Promise<Branch> => {
      const { data: resp, error } = await api.GET(
        '/v1/tenants/{tenantId}/branches/{branchId}' as any,
        { params: { path: { tenantId: tenantId!, branchId: branchId! } } },
      );
      if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      const item = (resp as any).data;
      return {
        ...item,
        address: formatAddressLabel(item.addressJson) ?? null,
      };
    },
    enabled: !!tenantId && !!branchId,
    staleTime: 0,
  });
}
