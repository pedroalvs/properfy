import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import type { InspectorBaseAddress } from '@properfy/shared';
import { Button } from '@/components/ui/Button';
import { Form } from '@/components/ui/Form';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/Sheet';
import { useIsOnline } from '@/hooks/useIsOnline';
import {
  BaseAddressFields,
  baseAddressFieldsSchema,
  EMPTY_BASE_ADDRESS_FIELDS,
  toInspectorBaseAddress,
  type BaseAddressFieldsValues,
} from '@/features/profile/components/BaseAddressFields';
import { useDayPlanOrigin } from '../hooks/useDayPlanOrigin';
import { dayPlanKeys } from '../api/day-plan-keys';
import { formatCivilDateShort } from '../lib/format-route';

interface OriginSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  /** Current per-day override address to pre-fill, when one is set. */
  overrideAddress?: InspectorBaseAddress | null;
  /** Return focus to the trigger after a successful save/close. */
  onSaved?: () => void;
}

// Errors that close the sheet and invalidate the plan (the day has moved on).
const CLOSE_AND_INVALIDATE = new Set([
  'DAY_PLAN_DATE_IN_PAST',
  'DAY_PLAN_NOT_PUBLISHED',
]);

function prefill(address: InspectorBaseAddress | null | undefined): BaseAddressFieldsValues {
  if (!address) return EMPTY_BASE_ADDRESS_FIELDS;
  return {
    street: address.street ?? '',
    number: address.number ?? '',
    complement: address.complement ?? '',
    suburb: address.suburb ?? '',
    state: address.state ?? '',
    postcode: address.postcode ?? '',
  };
}

/**
 * Bottom sheet to set the day's starting point (F04-3 "Base do dia"). Reuses the
 * shared BaseAddressFields (no autocomplete, DB4). A 422 ALREADY_STARTED shows
 * the server message, closes after 2 s and invalidates the plan (L-F04-07); a
 * past-date / not-published error closes and invalidates; other errors stay open.
 */
export function OriginSheet({ open, onOpenChange, date, overrideAddress, onSaved }: OriginSheetProps) {
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();
  const { setOrigin } = useDayPlanOrigin(date);
  const [serverError, setServerError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const form = useForm<BaseAddressFieldsValues>({
    resolver: zodResolver(baseAddressFieldsSchema),
    defaultValues: prefill(overrideAddress),
  });

  useEffect(() => {
    if (open) {
      form.reset(prefill(overrideAddress));
      setServerError(null);
      submittingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const invalidatePlan = () => queryClient.invalidateQueries({ queryKey: dayPlanKeys.byDate(date) });

  const close = () => {
    onOpenChange(false);
    onSaved?.();
  };

  const handleSave = async (values: BaseAddressFieldsValues) => {
    if (submittingRef.current || !isOnline) return;
    submittingRef.current = true;
    setServerError(null);
    const err = await setOrigin(toInspectorBaseAddress(values));
    submittingRef.current = false;
    if (!err) {
      close();
      return;
    }
    if (err.code === 'DAY_PLAN_ALREADY_STARTED') {
      setServerError(err.message);
      setTimeout(() => {
        void invalidatePlan();
        onOpenChange(false);
      }, 2000);
      return;
    }
    if (err.code && CLOSE_AND_INVALIDATE.has(err.code)) {
      void invalidatePlan();
      onOpenChange(false);
      return;
    }
    setServerError(err.message); // 422 NOT_FOUND / 503 GEOCODER — keep the form open
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" aria-busy={isSubmitting}>
        <SheetHeader>
          <SheetTitle>Start this day from</SheetTitle>
          <SheetDescription>
            Only for {formatCivilDateShort(date)}. Your base address stays the same.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSave)} noValidate className="mt-4 flex flex-col gap-3">
            <BaseAddressFields control={form.control} />

            {serverError && (
              <p role="alert" className="text-sm text-destructive">
                {serverError}
              </p>
            )}
            {!isOnline && (
              <p className="text-sm text-muted-foreground">
                You&apos;re offline. Connect to change your starting point.
              </p>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" loading={isSubmitting} disabled={!isOnline}>
                {isSubmitting ? 'Updating route…' : 'Use this address'}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
