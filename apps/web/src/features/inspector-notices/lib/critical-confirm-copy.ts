import { PLATFORM_TIMEZONE, formatWallTime } from '@properfy/shared';

export interface PublishConfirmCopyInput {
  critical: boolean;
  /**
   * The chosen audience size, used only as an SMS ceiling for critical notices.
   * `null` when the size is unknown (the ALL count failed or is still loading).
   */
  audienceSize: number | null;
  /** The instant the ConfirmDialog opened — the night-window is evaluated in Sydney. */
  now: Date;
}

const BASE_LINE = "Notices can't be edited or deleted after publishing. You can archive them later.";
const CRITICAL_LINE = 'Critical notices are sent by push, or by SMS to inspectors without push.';

/**
 * Build the paragraphs shown in the "Publish notice?" ConfirmDialog. The night
 * window (21:00–07:00) is always evaluated in Sydney (`PLATFORM_TIMEZONE`), never
 * the operator's browser timezone — there is no quiet hours, so this is only a
 * heads-up that inspectors are notified immediately (L-F02-02).
 */
export function buildPublishConfirmCopy(input: PublishConfirmCopyInput): string[] {
  const lines = [BASE_LINE];
  if (!input.critical) return lines;

  lines.push(CRITICAL_LINE);
  lines.push(smsCeilingLine(input.audienceSize));

  const timeLine = nightTimeLine(input.now);
  if (timeLine) lines.push(timeLine);

  return lines;
}

function smsCeilingLine(size: number | null): string {
  if (size == null) return 'Inspectors without push may receive an SMS.';
  return size === 1
    ? 'Up to 1 inspector may receive an SMS.'
    : `Up to ${size} inspectors may receive an SMS.`;
}

function nightTimeLine(now: Date): string | null {
  const { hour, wall } = sydneyWallClock(now);
  // [21:00, 07:00) in Sydney.
  if (hour >= 21 || hour < 7) {
    return `It's ${formatWallTime(wall)} in Sydney. Inspectors will be notified now.`;
  }
  return null;
}

/** The 24-hour hour and an `HH:mm` wall string for `now` in Sydney. */
function sydneyWallClock(now: Date): { hour: number; wall: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PLATFORM_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return { hour: Number(hh), wall: `${hh}:${mm}` };
}
