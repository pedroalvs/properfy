import type { PrismaClient } from '@prisma/client';
import type { IContactReader, ContactRegistryInfo, ContactRegistryChannel } from '../domain/contact-reader';

/** Defensive normalization — additional_channels_json is free-form JSONB. */
function toChannels(raw: unknown): ContactRegistryChannel[] {
  if (!Array.isArray(raw)) return [];
  const channels: ContactRegistryChannel[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { channel, value, label } = entry as Record<string, unknown>;
    if (typeof channel !== 'string' || typeof value !== 'string' || value.trim() === '') continue;
    channels.push({ channel, value, ...(typeof label === 'string' && label !== '' ? { label } : {}) });
  }
  return channels;
}

export class PrismaContactReader implements IContactReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findByIds(ids: string[]): Promise<ContactRegistryInfo[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.contact.findMany({
      where: { id: { in: ids } },
      select: { id: true, type: true, company: true, additional_channels_json: true },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      company: r.company,
      additionalChannels: toChannels(r.additional_channels_json),
    }));
  }
}
