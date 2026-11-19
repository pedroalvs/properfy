import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/hooks/useApiQuery';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { getIsStandalone } from '@/app/useInstallPrompt';
import { useInspectorMe } from '@/features/profile/hooks/useInspectorMe';
import { useCivilToday } from '@/features/today/hooks/useCivilToday';
import { useDayPlan } from '@/features/day-plan/hooks/useDayPlan';
import { AppTour } from './AppTour';
import { resolveTourSteps } from '../lib/tour-steps';
import { useAppTourController } from '../hooks/useAppTourController';

interface ReplayLocationState {
  replayTour?: boolean;
}

function readPushPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Mounts the app tour at the app frame level (from `PwaLayout`). Gathers the open
 * decision inputs from the router, auth, the inspector record and the Today plan,
 * drives {@link useAppTourController}, and renders {@link AppTour} when it opens.
 * The portal lives on `document.body`, so it is outside the inert `#root`.
 */
export function AppTourHost() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isOnline = useIsOnline();
  const me = useInspectorMe();
  const today = useCivilToday();

  const isTodayRoute = location.pathname === '/today';
  const replayRequested = (location.state as ReplayLocationState | null)?.replayTour === true;

  const dayPlan = useDayPlan(today, { enabled: isTodayRoute });
  const planSettled = dayPlan.state !== 'LOADING';

  const postCompletion = useCallback(async () => {
    await apiPost('/v1/inspectors/me/app-state', {
      displayMode: getIsStandalone() ? 'standalone' : 'browser',
      pushPermission: readPushPermission(),
      appVersion: __APP_VERSION__,
      onboardingCompleted: true,
    });
  }, []);

  const invalidateInspectorMe = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['inspector', 'me'] });
  }, [queryClient]);

  const deps = useMemo(
    () => ({
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      postCompletion,
      invalidateInspectorMe,
      isOnline: () => isOnline,
      hasOpenOverlay: () =>
        typeof document !== 'undefined' &&
        document.querySelector('[data-state="open"][role="dialog"]') !== null,
    }),
    [postCompletion, invalidateInspectorMe, isOnline],
  );

  const { open, onFinish } = useAppTourController(
    {
      userId: user?.id ?? null,
      onboardingCompletedAt: me.isSuccess ? (me.data?.data?.onboardingCompletedAt ?? null) : undefined,
      inspectorMeLoaded: me.isSuccess,
      isTodayRoute,
      planSettled,
      replayRequested,
    },
    deps,
  );

  // Consume the one-shot replay flag so a reload does not reopen the tour.
  useEffect(() => {
    if (replayRequested) navigate(location.pathname, { replace: true, state: null });
  }, [replayRequested, navigate, location.pathname]);

  const steps = useMemo(() => resolveTourSteps({ isStandalone: getIsStandalone() }), []);

  if (!open) return null;
  return <AppTour steps={steps} onFinish={onFinish} />;
}
