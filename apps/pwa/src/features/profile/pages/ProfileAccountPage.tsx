import { useState, useCallback, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { TIMING } from '@properfy/frontend-standards';
import { z } from 'zod';
import { applyPhoneMask, formatAuPhone, maxPhoneDigits, stripNonDigits, toE164Au } from '@properfy/shared';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/shell/TopBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { TimezonePicker } from '@/components/ui/TimezonePicker';
import { ProfileCard } from '../components/ProfileCard';
import { AvatarUploader } from '../components/AvatarUploader';
import { ChangePasswordSection } from '../components/ChangePasswordSection';
import { TwoFactorSection } from '../components/TwoFactorSection';
import { SessionsSection } from '../components/SessionsSection';
import { useInspectorMe } from '../hooks/useInspectorMe';
import { useUpdateInspectorSelf } from '../hooks/useUpdateInspectorSelf';
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
      <TopBar title="Account details" showBack backTo="/profile" backHideOnWide />

      {/* Settings read best as a comfortable centered column; short cards pair 2-up on tablet to
          shorten the page. Inert on phone (max-w-2xl > phone width). */}
      <div className="flex flex-col gap-3 p-4 md:mx-auto md:max-w-2xl">
        <ProfileCard
          name={user.name}
          email={user.email}
          role={user.role}
          status={user.status}
          phone={user.phone}
          timezone={user.timezone}
          totpEnabled={totpEnabled}
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

        {/* Security */}
        <SectionLabel>Security</SectionLabel>
        <ChangePasswordSection />
        <TwoFactorSection enabled={totpEnabled} onEnabled={() => setTotpEnabled(true)} />
        <SessionsSection />
      </div>
    </div>
  );
}
