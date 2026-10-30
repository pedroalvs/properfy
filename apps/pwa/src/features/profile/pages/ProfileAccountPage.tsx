import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { TIMING } from '@properfy/frontend-standards';
import { z } from 'zod';
import { SlidersHorizontal } from 'lucide-react';
import {
  applyPhoneMask,
  formatAuPhone,
  maxPhoneDigits,
  stripNonDigits,
  toE164Au,
  AU_STATES,
  inspectorBaseAddressSchema,
  type AuState,
} from '@properfy/shared';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/shell/TopBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@properfy/frontend-standards';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { TimezonePicker } from '@/components/ui/TimezonePicker';
import { MenuList, MenuRow } from '@/components/ui/MenuRow';
import { ProfileCard } from '../components/ProfileCard';
import { AvatarUploader } from '../components/AvatarUploader';
import { ChangePasswordSection } from '../components/ChangePasswordSection';
import { TwoFactorSection } from '../components/TwoFactorSection';
import { SessionsSection } from '../components/SessionsSection';
import { useInspectorMe } from '../hooks/useInspectorMe';
import { useUpdateInspectorSelf, UpdateInspectorSelfError } from '../hooks/useUpdateInspectorSelf';
import { useUpdateMyTimezone } from '../hooks/useUpdateMyTimezone';
import { useUnsavedChangesPrompt } from '@/lib/use-unsaved-changes-prompt';

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * Phone form schema. The shared {@link auPhoneSchema} transforms the value to
 * E.164 and rejects empty input, but this field submits the masked local string
 * and allows clearing, so we validate with a refine over the same `toE164Au`
 * helper instead of consuming the transforming schema directly.
 */
const phoneFormSchema = z.object({
  phone: z
    .string()
    .refine((v) => v.trim() === '' || toE164Au(v) !== null, {
      message: 'Enter a valid Australian phone number',
    }),
});
type PhoneFormValues = z.infer<typeof phoneFormSchema>;

/** Masks raw phone input to the local AU display format, capped at its max digits. */
function maskPhoneInput(raw: string): string {
  const stripped = stripNonDigits(raw);
  const max = maxPhoneDigits(stripped);
  const digits = stripped.startsWith('+')
    ? `+${stripped.slice(1).slice(0, max)}`
    : stripped.slice(0, max);
  return applyPhoneMask(digits);
}

/**
 * Base address form schema. Built on the shared `inspectorBaseAddressSchema` rules
 * (AU state enum, 4-digit postcode, trim) but with the exact per-field "required"
 * messages this screen shows. `city` is not a field — it is derived from `suburb`
 * on submit — and `country` is fixed to 'AU'. The server re-validates with
 * `inspectorBaseAddressSchema`, so this is purely the client-side UX layer.
 */
const baseAddressFormSchema = z.object({
  street: z.string().trim().min(1, 'Street is required').max(200),
  number: z.string().trim().max(20),
  complement: z.string().trim().max(200),
  suburb: z.string().trim().min(1, 'Suburb is required').max(100),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.enum(AU_STATES, { errorMap: () => ({ message: 'Select a state' }) })),
  postcode: z.string().trim().min(1, 'Postcode is required').regex(/^\d{4}$/, 'Postcode must be 4 digits'),
});
type BaseAddressFormValues = z.input<typeof baseAddressFormSchema>;

const EMPTY_BASE_ADDRESS: BaseAddressFormValues = {
  street: '',
  number: '',
  complement: '',
  suburb: '',
  state: '',
  postcode: '',
};

type BaseSaveState = 'idle' | 'ok' | 'geocode-failed';

/**
 * Inline "Base address" card on the account screen (contract 00.4). The inspector
 * enters/edits the base their day starts from; it is geocoded in permanent mode on
 * the server (TASK-F01-1). A saved address that does not satisfy
 * `inspectorBaseAddressSchema` is legacy-incompatible: the fields stay empty with a
 * re-entry prompt, never silently normalised.
 */
function BaseAddressCard() {
  const location = useLocation();
  const { data: me, isLoading, isError, refetch } = useInspectorMe();
  const { mutateAsync: updateSelf, isPending } = useUpdateInspectorSelf();
  const inspector = me?.data;
  const saved = inspector?.address;

  const parse = useMemo(() => inspectorBaseAddressSchema.safeParse(saved), [saved]);
  const isLegacy = saved != null && !parse.success;
  const defaults = useMemo<BaseAddressFormValues>(
    () =>
      parse.success
        ? {
            street: parse.data.street,
            number: parse.data.number ?? '',
            complement: parse.data.complement ?? '',
            suburb: parse.data.suburb,
            state: parse.data.state,
            postcode: parse.data.postcode,
          }
        : EMPTY_BASE_ADDRESS,
    [parse],
  );

  const form = useForm<BaseAddressFormValues>({
    resolver: zodResolver(baseAddressFormSchema),
    defaultValues: defaults,
  });

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<BaseSaveState>('idle');
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const didDeepLinkRef = useRef(false);

  // Re-seed the form when the saved address changes (first load, or after a save
  // + query invalidation). Keyed on the serialised defaults so it does not fire
  // mid-edit. `form`/`defaults` intentionally excluded to avoid a reset loop.
  const defaultsKey = JSON.stringify(defaults);
  useEffect(() => {
    form.reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsKey]);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  // Deep link: scroll to the card and focus the first empty field. A direct DOM
  // query (in field order) is used rather than RHF `setFocus` so focus is reliable
  // once the controls are mounted, including under jsdom. Depends on `isLoading` so
  // that on a cold direct load — when the card is still a skeleton (no ref) — it
  // re-runs once the form mounts; guarded to fire at most once.
  useEffect(() => {
    if (didDeepLinkRef.current || location.hash !== '#base-address') return;
    const node = cardRef.current;
    if (!node) return; // card not mounted yet (loading/error) — wait for a later run
    didDeepLinkRef.current = true;
    node.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    const controls = node.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select');
    const firstEmpty = Array.from(controls).find((el) => !el.value.trim());
    firstEmpty?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash, isLoading]);

  const handleSave = useCallback(
    async (values: BaseAddressFormValues) => {
      setSaveError(null);
      setSaveState('idle');
      const suburb = values.suburb.trim();
      try {
        const result = await updateSelf({
          address: {
            street: values.street.trim(),
            number: values.number.trim() || undefined,
            complement: values.complement.trim() || undefined,
            suburb,
            city: suburb,
            state: values.state as AuState,
            postcode: values.postcode.trim(),
            country: 'AU',
          },
        });
        setSaveState(result.baseGeocodeFailed ? 'geocode-failed' : 'ok');
        form.reset(values);
        // Auto-dismiss the inline result after a moment, like the phone/timezone saves.
        if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = setTimeout(() => setSaveState('idle'), TIMING.toastDismiss);
      } catch (err) {
        if (err instanceof UpdateInspectorSelfError && err.details?.length) {
          let mapped = false;
          for (const issue of err.details) {
            const field = issue.path[issue.path.length - 1];
            if (typeof field === 'string' && field in values) {
              form.setError(field as keyof BaseAddressFormValues, { message: issue.message });
              mapped = true;
            }
          }
          if (!mapped) setSaveError(err.message);
        } else {
          setSaveError(err instanceof Error ? err.message : 'Failed to update profile');
        }
      }
    },
    [updateSelf, form],
  );

  if (isLoading) {
    return (
      <Card data-testid="base-address-card">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Base address</p>
        <div className="mt-4 flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card data-testid="base-address-card">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Base address</p>
        <p className="mt-4 text-sm text-muted-foreground">Couldn&apos;t load your address.</p>
        <Button type="button" variant="outlined" className="mt-3" onClick={() => void refetch()}>
          Retry
        </Button>
      </Card>
    );
  }

  const isDirty = form.formState.isDirty;

  return (
    <Card id="base-address" ref={cardRef} data-testid="base-address-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Base address</p>
      <p className="mt-1 text-xs text-muted-foreground">Where your day starts. Used to plan your route.</p>

      {isLegacy && (
        <div className="mt-3 rounded-btn bg-warning/10 p-3">
          <p className="text-xs font-medium text-warning">Your saved address is incomplete. Please enter it again.</p>
          <p className="mt-1 break-words text-[11px] text-muted-foreground">
            Saved value: {typeof saved === 'string' ? saved : JSON.stringify(saved)}
          </p>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSave)} noValidate className="mt-4 flex flex-col gap-3">
          <FormField
            control={form.control}
            name="street"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Street</FormLabel>
                <FormControl>
                  <Input autoComplete="address-line1" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="complement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <FormControl>
                    <Input autoComplete="address-line2" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="suburb"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Suburb</FormLabel>
                <FormControl>
                  <Input autoComplete="address-level2" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <FormControl>
                    <select
                      autoComplete="address-level1"
                      className={cn(
                        'flex min-h-touch w-full rounded-btn border border-input bg-card px-3 py-2 text-base text-foreground shadow-sm transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
                      )}
                      {...field}
                    >
                      <option value="">Select…</option>
                      {AU_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="postcode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Postcode</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" autoComplete="postal-code" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {saveError && <p className="text-xs text-destructive">{saveError}</p>}
          {saveState === 'ok' && (
            <p role="status" aria-live="polite" className="text-xs text-success">
              Saved successfully
            </p>
          )}
          {saveState === 'geocode-failed' && (
            <p role="status" aria-live="polite" className="text-xs text-warning">
              Saved, but we couldn&apos;t locate this address. Please check it.
            </p>
          )}

          {isDirty && (
            <Button type="submit" loading={isPending} className="w-full">
              {isPending ? 'Saving…' : 'Save address'}
            </Button>
          )}
        </form>
      </Form>
    </Card>
  );
}

export function ProfileAccountPage() {
  const { user, refreshUser } = useAuth();
  const { data: inspectorMe, isLoading: isInspectorLoading } = useInspectorMe();
  const { mutateAsync: updateSelf, isPending: isSavingPhone } = useUpdateInspectorSelf();
  const { mutateAsync: updateTimezone, isPending: isSavingTimezone } = useUpdateMyTimezone();

  const [totpEnabled, setTotpEnabled] = useState(user?.totpEnabled ?? false);

  const phoneForm = useForm<PhoneFormValues>({
    resolver: zodResolver(phoneFormSchema),
    defaultValues: { phone: formatAuPhone(user?.phone ?? '') },
  });
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSuccess, setPhoneSuccess] = useState(false);

  const [timezone, setTimezone] = useState(user?.personalTimezone ?? '');
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const [timezoneSuccess, setTimezoneSuccess] = useState(false);

  const isPhoneDirty = phoneForm.formState.isDirty;
  const isTimezoneDirty = timezone !== (user?.personalTimezone ?? '');
  const isAnyDirty = isPhoneDirty || isTimezoneDirty;

  useUnsavedChangesPrompt(isAnyDirty);

  const phoneSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timezoneSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (phoneSuccessTimeoutRef.current) clearTimeout(phoneSuccessTimeoutRef.current);
      if (timezoneSuccessTimeoutRef.current) clearTimeout(timezoneSuccessTimeoutRef.current);
    };
  }, []);

  const handleSavePhone = useCallback(async (values: PhoneFormValues) => {
    setPhoneError(null);
    setPhoneSuccess(false);
    try {
      await updateSelf({ phone: values.phone || null });
      setPhoneSuccess(true);
      refreshUser();
      // Rebase the form so the saved value becomes the new clean baseline.
      phoneForm.reset({ phone: values.phone });
      if (phoneSuccessTimeoutRef.current) clearTimeout(phoneSuccessTimeoutRef.current);
      phoneSuccessTimeoutRef.current = setTimeout(() => setPhoneSuccess(false), TIMING.toastDismiss);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Failed to save');
    }
  }, [updateSelf, refreshUser, phoneForm]);

  const handleTimezoneChange = useCallback((next: string) => {
    setTimezone(next);
    setTimezoneError(null);
    setTimezoneSuccess(false);
  }, []);

  const handleSaveTimezone = useCallback(async () => {
    setTimezoneError(null);
    setTimezoneSuccess(false);
    try {
      // Empty string means "back to the platform default" — the API models it as null.
      await updateTimezone({ timezone: timezone === '' ? null : timezone });
      await refreshUser();
      setTimezoneSuccess(true);
      if (timezoneSuccessTimeoutRef.current) clearTimeout(timezoneSuccessTimeoutRef.current);
      timezoneSuccessTimeoutRef.current = setTimeout(() => setTimezoneSuccess(false), TIMING.toastDismiss);
    } catch (err) {
      setTimezoneError(err instanceof Error ? err.message : 'Failed to save');
    }
  }, [timezone, updateTimezone, refreshUser]);

  if (!user) return null;

  return (
    <div className="w-full pb-20">
      <TopBar title="My account" showBack backTo="/profile" backHideOnWide />

      {/* Settings read best as a comfortable centered column; short cards pair 2-up on tablet to
          shorten the page. Inert on phone (max-w-2xl > phone width). */}
      <div className="flex flex-col gap-3 p-4 md:mx-auto md:max-w-2xl">
        <ProfileCard
          name={user.name}
          email={user.email}
          role={user.role}
          status={user.status}
          lastLoginAt={user.lastLoginAt}
          photoUrl={user.inspectorPhotoUrl}
          showStats={user.role === 'INSP'}
          ratingAvg={inspectorMe?.data?.rating?.average ?? null}
          ratingCount={inspectorMe?.data?.rating?.responseCount ?? 0}
          completedCount={inspectorMe?.data?.rating?.doneServicesCount ?? 0}
          ratingLoading={isInspectorLoading}
        />

        {/* Photo */}
        <Card data-testid="avatar-upload-section">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Profile photo</p>
          <div className="mt-4 flex items-center gap-4">
            {user.inspectorPhotoUrl ? (
              <img
                src={user.inspectorPhotoUrl}
                alt={user.name}
                className="h-16 w-16 rounded-2xl object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            {user.inspectorId && (
              <AvatarUploader inspectorId={user.inspectorId} onUploaded={refreshUser} />
            )}
          </div>
        </Card>

        {/* Phone + Timezone — a gap'd flex column on phone (preserving the 12px the parent gave the
            two cards), paired 2-up on tablet to shorten the settings column. */}
        <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-3 md:items-start" data-testid="account-phone-timezone">
        {/* Phone */}
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Phone</p>
          <Form {...phoneForm}>
            <form onSubmit={phoneForm.handleSubmit(handleSavePhone)} noValidate className="mt-4 flex flex-col gap-3">
              <FormField
                control={phoneForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="sr-only">Phone</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="0412 345 678"
                        disabled={phoneForm.formState.isSubmitting}
                        {...field}
                        onChange={(e) => {
                          field.onChange(maskPhoneInput(e.target.value));
                          setPhoneSuccess(false);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
              {phoneSuccess && <p className="text-xs text-success">Saved successfully</p>}
              {isPhoneDirty && (
                <Button type="submit" loading={isSavingPhone} className="w-full">
                  {isSavingPhone ? 'Saving…' : 'Save phone'}
                </Button>
              )}
            </form>
          </Form>
        </Card>

        {/* Timezone */}
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Timezone</p>
          <div className="mt-4 flex flex-col gap-3">
            <TimezonePicker
              id="edit-timezone"
              aria-label="Timezone"
              value={timezone || null}
              onChange={handleTimezoneChange}
              placeholder="Platform default (Sydney)"
              allowClear
            />
            <p className="text-xs text-muted-foreground">
              Your schedule and offers are shown in this timezone.
            </p>
            {timezoneError && <p className="text-xs text-destructive">{timezoneError}</p>}
            {timezoneSuccess && <p className="text-xs text-success">Saved successfully</p>}
            {isTimezoneDirty && (
              <Button type="button" onClick={handleSaveTimezone} loading={isSavingTimezone} className="w-full">
                {isSavingTimezone ? 'Saving…' : 'Save timezone'}
              </Button>
            )}
          </div>
        </Card>
        </div>

        {/* Base address (contract 00.4) */}
        <BaseAddressCard />

        {/* Security */}
        <SectionLabel>Security</SectionLabel>
        <ChangePasswordSection />
        <TwoFactorSection enabled={totpEnabled} onEnabled={() => setTotpEnabled(true)} />
        <SessionsSection />

        {/* More — the growth list for future account sub-screens. */}
        <SectionLabel>More</SectionLabel>
        <MenuList>
          <MenuRow
            icon={<SlidersHorizontal className="h-5 w-5" aria-hidden="true" />}
            label="App settings"
            sublabel="Install and app info"
            to="/profile/settings"
          />
        </MenuList>
      </div>
    </div>
  );
}
