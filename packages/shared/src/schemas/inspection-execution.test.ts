import { describe, it, expect } from 'vitest';
import {
  inspectorScheduleQuerySchema,
  startInspectionSchema,
  finishInspectionSchema,
  requestAssetUploadSchema,
} from './inspection-execution';

describe('inspectorScheduleQuerySchema', () => {
  it('should accept empty object', () => {
    const result = inspectorScheduleQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept valid date', () => {
    const result = inspectorScheduleQuerySchema.safeParse({ date: '2026-03-21' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid date format', () => {
    const result = inspectorScheduleQuerySchema.safeParse({ date: '03-21-2026' });
    expect(result.success).toBe(false);
  });
});

describe('startInspectionSchema', () => {
  it('should accept valid coordinates', () => {
    const result = startInspectionSchema.safeParse({
      latitude: -23.5505,
      longitude: -46.6333,
    });
    expect(result.success).toBe(true);
  });

  it('should reject latitude greater than 90', () => {
    const result = startInspectionSchema.safeParse({
      latitude: 91,
      longitude: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject longitude less than -180', () => {
    const result = startInspectionSchema.safeParse({
      latitude: 0,
      longitude: -181,
    });
    expect(result.success).toBe(false);
  });
});

describe('finishInspectionSchema', () => {
  it('should accept valid input with all fields', () => {
    const result = finishInspectionSchema.safeParse({
      latitude: -23.5505,
      longitude: -46.6333,
      checklistJson: { item1: true, item2: false },
      notes: 'Inspection completed successfully',
      assets: [
        {
          assetId: '550e8400-e29b-41d4-a716-446655440000',
          storageKey: 'uploads/photo1.jpg',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should accept minimal input with lat/lng only and default assets to empty array', () => {
    const result = finishInspectionSchema.safeParse({
      latitude: -23.5505,
      longitude: -46.6333,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assets).toEqual([]);
    }
  });

  it('should reject notes longer than 5000 characters', () => {
    const result = finishInspectionSchema.safeParse({
      latitude: -23.5505,
      longitude: -46.6333,
      notes: 'a'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});

describe('requestAssetUploadSchema', () => {
  it('should accept valid input', () => {
    const result = requestAssetUploadSchema.safeParse({
      kind: 'PHOTO',
      mimeType: 'image/jpeg',
      fileName: 'photo1.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid kind', () => {
    const result = requestAssetUploadSchema.safeParse({
      kind: 'VIDEO',
      mimeType: 'video/mp4',
      fileName: 'video1.mp4',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty fileName', () => {
    const result = requestAssetUploadSchema.safeParse({
      kind: 'DOCUMENT',
      mimeType: 'application/pdf',
      fileName: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty mimeType', () => {
    const result = requestAssetUploadSchema.safeParse({
      kind: 'SIGNATURE',
      mimeType: '',
      fileName: 'signature.png',
    });
    expect(result.success).toBe(false);
  });
});
