import { useEffect, useRef, useState } from 'react';
import {
  publishInspectorNoticeSchema,
  isNetworkError,
  INSPECTOR_NOTICE_TITLE_MAX,
  INSPECTOR_NOTICE_BODY_MAX,
  INSPECTOR_NOTICE_SELECTED_MAX,
  type InspectorNoticeAudienceInput,
  type PublishInspectorNoticeInput,
  type ApiError,
} from '@properfy/shared';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { Textarea } from '@/components/forms/Textarea';
import { Checkbox } from '@/components/forms/Checkbox';
import { FormActions } from '@/components/forms/FormActions';
import { Button } from '@/components/ui/Button';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { useSnackbar } from '@/hooks/useSnackbar';
import { InspectorMultiSelect } from './InspectorMultiSelect';
import { RegionSelect } from './RegionSelect';
import { useActiveInspectorCount } from '../hooks/useActiveInspectorCount';
import { useActiveRegionOptions } from '../hooks/useActiveRegionOptions';
import { usePublishInspectorNotice } from '../hooks/usePublishInspectorNotice';
import { buildPublishConfirmCopy } from '../lib/critical-confirm-copy';
import type { AudienceKind } from '../types';

export interface NewInspectorNoticeDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful publish, so the list can refresh. */
  onPublished?: () => void;
}

interface FormErrors {
  title?: string;
  body?: string;
  selectedIds?: string;
  regionId?: string;
}

function buildAudienceInput(
  audienceKind: AudienceKind,
  selectedIds: string[],
  regionId: string,
): InspectorNoticeAudienceInput | null {
  if (audienceKind === 'ALL') return { type: 'ALL' };
  if (audienceKind === 'SELECTED') {
    return selectedIds.length ? { type: 'SELECTED', inspectorIds: selectedIds } : null;
  }
  return regionId ? { type: 'REGION', regionId } : null;
}

/**
 * The New notice drawer. Follows the web's controlled-form convention (no
 * react-hook-form in this workspace); the publish payload is validated against
 * the shared `publishInspectorNoticeSchema` so the contract stays the source of
 * truth. A notice cannot be edited or deleted after publishing (D4) — the drawer
 * only creates.
 */
export function NewInspectorNoticeDrawer({ open, onClose, onPublished }: NewInspectorNoticeDrawerProps) {
  const { showSuccess } = useSnackbar();
  const { publish, isPending, resetKey } = usePublishInspectorNotice();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [critical, setCritical] = useState(false);
  const [audienceKind, setAudienceKind] = useState<AudienceKind>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [regionId, setRegionId] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [confirm, setConfirm] = useState<{ payload: PublishInspectorNoticeInput; now: Date } | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  // Audience-size ceiling for the critical ConfirmDialog (L-F02-01).
  const allCount = useActiveInspectorCount(open && audienceKind === 'ALL');
  const { options: regionOptions } = useActiveRegionOptions(open && audienceKind === 'REGION');
  const audienceSize =
    audienceKind === 'ALL'
      ? allCount.count
      : audienceKind === 'SELECTED'
        ? selectedIds.length
        : (regionOptions.find((r) => r.id === regionId)?.inspectorCount ?? null);

  const dirty =
    title !== '' || body !== '' || critical || audienceKind !== 'ALL' || selectedIds.length > 0 || regionId !== '';

  // Fresh Idempotency-Key and a clean form each time the drawer opens.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setTitle('');
      setBody('');
      setCritical(false);
      setAudienceKind('ALL');
      setSelectedIds([]);
      setRegionId('');
      setErrors({});
      setBanner(null);
      setConfirm(null);
      resetKey();
    }
    wasOpen.current = open;
  }, [open, resetKey]);

  function validate(): FormErrors {
    const next: FormErrors = {};
    const t = title.trim();
    const b = body.trim();
    if (!t) next.title = 'Title is required';
    else if (t.length > INSPECTOR_NOTICE_TITLE_MAX)
      next.title = `Title must be ${INSPECTOR_NOTICE_TITLE_MAX} characters or fewer`;
    if (!b) next.body = 'Message is required';
    else if (b.length > INSPECTOR_NOTICE_BODY_MAX)
      next.body = `Message must be ${INSPECTOR_NOTICE_BODY_MAX} characters or fewer`;
    if (audienceKind === 'SELECTED') {
      if (selectedIds.length === 0) next.selectedIds = 'Select at least one inspector';
      else if (selectedIds.length > INSPECTOR_NOTICE_SELECTED_MAX)
        next.selectedIds = `You can select up to ${INSPECTOR_NOTICE_SELECTED_MAX} inspectors. Use All active inspectors or Region instead.`;
    }
    if (audienceKind === 'REGION' && !regionId) next.regionId = 'Select a region';
    return next;
  }

  function handlePublishClick() {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const audience = buildAudienceInput(audienceKind, selectedIds, regionId);
    if (!audience) return;
    const payload = publishInspectorNoticeSchema.parse({ title, body, critical, audience });
    setBanner(null);
    setConfirm({ payload, now: new Date() });
  }

  async function handleConfirmPublish() {
    if (!confirm) return;
    setBanner(null);
    try {
      const result = await publish(confirm.payload);
      showSuccess(
        `Notice published to ${result.recipientCount} inspector${result.recipientCount === 1 ? '' : 's'}`,
      );
      setConfirm(null);
      onPublished?.();
      onClose();
    } catch (err) {
      setConfirm(null);
      applyPublishError(err as ApiError);
    }
  }

  function applyPublishError(err: ApiError) {
    if (isNetworkError(err)) {
      setBanner("You're offline. Check your connection and try again.");
      return;
    }
    switch (err.code) {
      case 'INSPECTOR_NOTICE_NO_RECIPIENTS':
        setBanner('No active inspectors match this audience.');
        break;
      case 'INSPECTOR_NOTICE_INVALID_RECIPIENTS': {
        setBanner('Some selected inspectors are no longer active. Review the selection.');
        const invalid = (err.details as unknown as { inspectorIds?: string[] } | undefined)?.inspectorIds ?? [];
        if (invalid.length > 0) setSelectedIds((prev) => prev.filter((id) => !invalid.includes(id)));
        break;
      }
      case 'INSPECTOR_NOTICE_REGION_INACTIVE':
      case 'INSPECTOR_NOTICE_REGION_NOT_FOUND':
        setBanner('This region is inactive. Choose another region.');
        break;
      default:
        setBanner("Couldn't publish the notice. Try again.");
    }
  }

  function requestClose() {
    if (dirty) setDiscardOpen(true);
    else onClose();
  }

  const titleLen = title.trim().length;
  const bodyLen = body.trim().length;
  const confirmLines = confirm ? buildPublishConfirmCopy({ critical, audienceSize, now: confirm.now }) : [];

  return (
    <>
      <DrawerPanel open={open} onClose={requestClose} ariaLabel="New notice">
        <DrawerHeader title="New notice" onClose={requestClose} />
        <form
          className="flex flex-col gap-4 overflow-y-auto p-4"
          onSubmit={(e) => {
            e.preventDefault();
            handlePublishClick();
          }}
          noValidate
        >
          {banner && (
            <div role="alert">
              <InfoBanner variant="error">{banner}</InfoBanner>
            </div>
          )}

          <FormField label="Title" required error={errors.title} htmlFor="notice-title">
            <TextInput
              id="notice-title"
              value={title}
              onChange={setTitle}
              disabled={isPending}
              error={!!errors.title}
              focusOnMount
              aria-label="Title"
            />
            <span
              className={titleLen > INSPECTOR_NOTICE_TITLE_MAX ? 'text-xs text-error' : 'text-xs text-text-secondary'}
              aria-live="polite"
            >
              {titleLen}/{INSPECTOR_NOTICE_TITLE_MAX}
            </span>
          </FormField>

          <FormField label="Message" required error={errors.body} htmlFor="notice-body">
            <Textarea
              id="notice-body"
              value={body}
              onChange={setBody}
              rows={6}
              disabled={isPending}
              error={!!errors.body}
              aria-label="Message"
              aria-invalid={!!errors.body}
              aria-describedby="notice-body-hint notice-body-lock notice-body-count"
            />
            <p id="notice-body-hint" className="text-xs text-text-secondary">
              Plain text. Inspectors see it in the app&apos;s Announcements.
            </p>
            <p id="notice-body-lock" className="text-xs text-text-secondary">
              Shown on the lock screen. Don&apos;t include keys, codes or tenant details.
            </p>
            <span
              id="notice-body-count"
              className={bodyLen > INSPECTOR_NOTICE_BODY_MAX ? 'text-xs text-error' : 'text-xs text-text-secondary'}
              aria-live="polite"
            >
              {bodyLen}/{INSPECTOR_NOTICE_BODY_MAX}
            </span>
          </FormField>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-text-primary">Audience</legend>
            {(
              [
                ['ALL', 'All active inspectors'],
                ['SELECTED', 'Selected inspectors'],
                ['REGION', 'Region'],
              ] as Array<[AudienceKind, string]>
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="audienceKind"
                  value={value}
                  checked={audienceKind === value}
                  onChange={() => setAudienceKind(value)}
                  disabled={isPending}
                />
                {label}
              </label>
            ))}
            {audienceKind === 'SELECTED' && (
              <InspectorMultiSelect
                selectedIds={selectedIds}
                onChange={setSelectedIds}
                error={errors.selectedIds}
                disabled={isPending}
              />
            )}
            {audienceKind === 'REGION' && (
              <RegionSelect
                id="notice-region"
                value={regionId}
                onChange={setRegionId}
                error={errors.regionId}
                disabled={isPending}
              />
            )}
          </fieldset>

          <div className="flex flex-col gap-1">
            <Checkbox
              id="notice-critical"
              checked={critical}
              onChange={setCritical}
              label="Mark as critical"
              disabled={isPending}
            />
            <p className="pl-6 text-xs text-text-secondary">
              Sent by push, or by SMS to inspectors without push. Use for urgent operational changes.
            </p>
          </div>

          <FormActions>
            <Button type="button" variant="secondary" onClick={requestClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isPending} disabled={isPending}>
              {isPending ? 'Publishing…' : 'Publish'}
            </Button>
          </FormActions>
        </form>
      </DrawerPanel>

      <ConfirmDialog
        open={!!confirm}
        title="Publish notice?"
        message={
          <span className="flex flex-col gap-2">
            {confirmLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        }
        confirmLabel="Publish"
        cancelLabel="Back to editing"
        variant="warning"
        loading={isPending}
        onConfirm={handleConfirmPublish}
        onClose={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={discardOpen}
        title="Discard this notice?"
        message="Your changes won't be saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="danger"
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
        onClose={() => setDiscardOpen(false)}
      />
    </>
  );
}
