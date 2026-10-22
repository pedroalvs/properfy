import { todayInTzDateString } from '@properfy/shared';
import { getDocumentsStatus } from '../documents-status';

const TZ = 'Australia/Sydney';

/** A civil day offset from today in TZ, as YYYY-MM-DD, to keep the test TZ-stable. */
function dayOffset(days: number): string {
  const today = todayInTzDateString(TZ);
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const onFileFuture = {
  insuranceFileKey: 'ins.pdf',
  insuranceExpiresAt: dayOffset(200),
  policeCheckFileKey: 'pc.pdf',
  policeCheckExpiresAt: dayOffset(200),
};

describe('getDocumentsStatus', () => {
  it('is "All on file" when both are present and far from expiry', () => {
    expect(getDocumentsStatus(onFileFuture, TZ)).toEqual({ tone: 'good', label: 'All on file' });
  });

  it('is "Action needed" when a document is missing', () => {
    expect(getDocumentsStatus({ ...onFileFuture, policeCheckFileKey: null }, TZ)).toEqual({
      tone: 'danger',
      label: 'Action needed',
    });
  });

  it('is "Action needed" when a document has expired', () => {
    expect(getDocumentsStatus({ ...onFileFuture, insuranceExpiresAt: dayOffset(-1) }, TZ)).toEqual({
      tone: 'danger',
      label: 'Action needed',
    });
  });

  it('counts documents expiring within 30 days', () => {
    expect(getDocumentsStatus({ ...onFileFuture, insuranceExpiresAt: dayOffset(10) }, TZ)).toEqual({
      tone: 'warning',
      label: '1 expiring',
    });
    expect(
      getDocumentsStatus(
        { ...onFileFuture, insuranceExpiresAt: dayOffset(10), policeCheckExpiresAt: dayOffset(5) },
        TZ,
      ),
    ).toEqual({ tone: 'warning', label: '2 expiring' });
  });

  it('treats metaJson as on-file even without a file key', () => {
    expect(
      getDocumentsStatus(
        {
          insuranceMetaJson: { fileName: 'x.pdf' },
          insuranceExpiresAt: dayOffset(200),
          policeCheckMetaJson: { fileName: 'y.pdf' },
          policeCheckExpiresAt: dayOffset(200),
        },
        TZ,
      ),
    ).toEqual({ tone: 'good', label: 'All on file' });
  });
});
