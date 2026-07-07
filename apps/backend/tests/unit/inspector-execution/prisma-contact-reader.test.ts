import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaContactReader } from '../../../src/modules/inspector-execution/infrastructure/prisma-contact-reader';

function makePrisma(rows: unknown[]): PrismaClient {
  return {
    contact: { findMany: vi.fn().mockResolvedValue(rows) },
  } as unknown as PrismaClient;
}

describe('PrismaContactReader', () => {
  it('returns [] without querying when ids is empty', async () => {
    const prisma = makePrisma([]);
    const reader = new PrismaContactReader(prisma);

    expect(await reader.findByIds([])).toEqual([]);
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it('maps rows and normalizes well-formed additional channels', async () => {
    const prisma = makePrisma([
      {
        id: 'c1',
        type: 'INDIVIDUAL',
        company: 'Acme',
        additional_channels_json: [
          { channel: 'PHONE', value: '+61411111111', label: 'Work' },
          { channel: 'EMAIL', value: 'alt@x.com' },
        ],
      },
    ]);

    const result = await new PrismaContactReader(prisma).findByIds(['c1']);

    expect(result).toEqual([
      {
        id: 'c1',
        type: 'INDIVIDUAL',
        company: 'Acme',
        additionalChannels: [
          { channel: 'PHONE', value: '+61411111111', label: 'Work' },
          { channel: 'EMAIL', value: 'alt@x.com' },
        ],
      },
    ]);
  });

  it('drops malformed channel entries and tolerates non-array JSONB', async () => {
    const prisma = makePrisma([
      {
        id: 'c1',
        type: 'COMPANY',
        company: null,
        additional_channels_json: [
          null,
          'bogus',
          { channel: 42, value: 'x' },
          { channel: 'PHONE', value: '   ' },
          { channel: 'PHONE', value: '+61422222222', label: '' },
        ],
      },
      { id: 'c2', type: 'INDIVIDUAL', company: null, additional_channels_json: { not: 'an array' } },
    ]);

    const result = await new PrismaContactReader(prisma).findByIds(['c1', 'c2']);

    expect(result[0]!.additionalChannels).toEqual([{ channel: 'PHONE', value: '+61422222222' }]);
    expect(result[1]!.additionalChannels).toEqual([]);
  });
});
