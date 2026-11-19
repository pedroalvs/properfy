import { describe, it, expect } from 'vitest';
import {
  PROPERTY_FILE_STORAGE_BUCKET,
  PORTAL_MAX_PHOTOS_PER_ISSUE,
  FILE_STORAGE_UNAVAILABLE_MESSAGE,
  extensionForMime,
  buildPropertyFileStorageKey,
  parsePropertyFileStorageKey,
  buildPortalIssueStorageKey,
  parsePortalIssueStorageKey,
} from './property-files';

const TENANT = '11111111-1111-1111-1111-111111111111';
const PROPERTY = '22222222-2222-2222-2222-222222222222';
const APPOINTMENT = '33333333-3333-3333-3333-333333333333';
const FILE = '44444444-4444-4444-4444-444444444444';

describe('property-files constants', () => {
  it('reuses the existing inspection-assets bucket (D10)', () => {
    expect(PROPERTY_FILE_STORAGE_BUCKET).toBe('inspection-assets');
  });

  it('caps portal photos per issue at 5 (D17)', () => {
    expect(PORTAL_MAX_PHOTOS_PER_ISSUE).toBe(5);
  });

  it('exposes one storage-unavailable message (D16)', () => {
    expect(FILE_STORAGE_UNAVAILABLE_MESSAGE).toMatch(/storage/i);
  });

  it('maps MIME types to extensions and falls back to bin', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('application/pdf')).toBe('pdf');
    expect(
      extensionForMime(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe('xlsx');
    expect(extensionForMime('application/x-msdownload')).toBe('bin');
  });
});

describe('property file storage-key grammar (D25)', () => {
  it('builds and round-trips the authenticated key', () => {
    const key = buildPropertyFileStorageKey({
      tenantId: TENANT,
      propertyId: PROPERTY,
      fileId: FILE,
      ext: 'jpg',
    });
    expect(key).toBe(`files/${TENANT}/${PROPERTY}/${FILE}.jpg`);
    expect(parsePropertyFileStorageKey(key)).toEqual({
      tenantId: TENANT,
      propertyId: PROPERTY,
      fileId: FILE,
      ext: 'jpg',
    });
  });

  it('rejects a malformed or portal key as not an authenticated key', () => {
    expect(parsePropertyFileStorageKey('files/not-a-uuid/x/y.jpg')).toBeNull();
    expect(
      parsePropertyFileStorageKey(
        buildPortalIssueStorageKey({
          tenantId: TENANT,
          appointmentId: APPOINTMENT,
          fileId: FILE,
          ext: 'jpg',
        }),
      ),
    ).toBeNull();
  });
});

describe('portal issue storage-key grammar (D25)', () => {
  it('builds and round-trips the portal key scoped to the appointment', () => {
    const key = buildPortalIssueStorageKey({
      tenantId: TENANT,
      appointmentId: APPOINTMENT,
      fileId: FILE,
      ext: 'png',
    });
    expect(key).toBe(`files/${TENANT}/tenant-issues/${APPOINTMENT}/${FILE}.png`);
    expect(parsePortalIssueStorageKey(key)).toEqual({
      tenantId: TENANT,
      appointmentId: APPOINTMENT,
      fileId: FILE,
      ext: 'png',
    });
  });

  it('rejects an authenticated key as not a portal key', () => {
    expect(
      parsePortalIssueStorageKey(
        buildPropertyFileStorageKey({
          tenantId: TENANT,
          propertyId: PROPERTY,
          fileId: FILE,
          ext: 'jpg',
        }),
      ),
    ).toBeNull();
  });
});
