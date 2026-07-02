import { useCallback, useState } from 'react';
import { ApiError } from '@/lib/api-error';
import type { AvailableGroup } from '../types';
import { useJoinGroup } from './usePortalData';

interface UseJoinGroupFlowOptions {
  onJoined: () => void;
  onSlotUnavailable: () => void;
}

export function useJoinGroupFlow(
  token: string,
  { onJoined, onSlotUnavailable }: UseJoinGroupFlowOptions,
) {
  const joinGroupMutation = useJoinGroup(token);
  const [selectedSlot, setSelectedSlot] = useState<AvailableGroup | null>(null);
  const [joinErrorMessage, setJoinErrorMessage] = useState<string | null>(null);

  const selectSlot = useCallback((group: AvailableGroup) => {
    joinGroupMutation.reset();
    setJoinErrorMessage(null);
    setSelectedSlot(group);
  }, [joinGroupMutation]);

  const clearSelection = useCallback(() => {
    joinGroupMutation.reset();
    setJoinErrorMessage(null);
    setSelectedSlot(null);
  }, [joinGroupMutation]);

  const clearError = useCallback(() => {
    setJoinErrorMessage(null);
  }, []);

  const joinSelectedSlot = useCallback(async () => {
    if (!selectedSlot) return;
    setJoinErrorMessage(null);

    try {
      await joinGroupMutation.mutateAsync({
        groupId: selectedSlot.groupId,
        scheduledDate: selectedSlot.scheduledDate,
        timeSlotStart: selectedSlot.timeSlotStart,
        timeSlotEnd: selectedSlot.timeSlotEnd,
      });
      clearSelection();
      onJoined();
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      if (apiError?.code === 'PORTAL_GROUP_SLOT_UNAVAILABLE') {
        setSelectedSlot(null);
        setJoinErrorMessage('This time slot is no longer available. Please pick another one.');
        onSlotUnavailable();
        return;
      }

      setJoinErrorMessage('We could not join this time slot. Please try again.');
    }
  }, [clearSelection, joinGroupMutation, onJoined, onSlotUnavailable, selectedSlot]);

  return {
    selectedSlot,
    joinErrorMessage,
    isJoining: joinGroupMutation.isPending,
    selectSlot,
    clearSelection,
    clearError,
    joinSelectedSlot,
  };
}
