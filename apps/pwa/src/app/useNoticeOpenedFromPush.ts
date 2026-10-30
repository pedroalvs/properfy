import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { INSPECTOR_NOTICE_UUID_RE } from '@properfy/shared';
import { apiPost } from '@/hooks/useApiQuery';

/**
 * When a notification opens a system target (e.g. `/schedule/:id`), the service
 * worker appends `?fromNotice=<id>` so the app marks that notice read even
 * though the inspector did not open its announcement page. This reads the param
 * once, fires the read without awaiting, invalidates the inbox, and strips the
 * param with a replace-navigation. A non-UUID value is ignored and removed; a
 * 404 is silent. Mounted in `PwaLayout`.
 */
export function useNoticeOpenedFromPush(): void {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const fromNotice = params.get('fromNotice');
    if (!fromNotice) return;

    if (INSPECTOR_NOTICE_UUID_RE.test(fromNotice) && handledRef.current !== fromNotice) {
      handledRef.current = fromNotice;
      void apiPost(`/v1/inspectors/me/notices/${fromNotice}/read`).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: ['inspector-notices'] });
    }
    // Strip the param either way so a refresh does not re-trigger it.
    navigate(pathname, { replace: true });
  }, [params, navigate, pathname, queryClient]);
}
