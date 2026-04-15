import type { AdditionalChannel } from './contact.entity';
import { ContactChannelDuplicatedError, ContactNoChannelError } from './contact.errors';

export function validateAtLeastOneChannel(
  primaryEmail: string | null | undefined,
  primaryPhone: string | null | undefined,
): void {
  if (!primaryEmail && !primaryPhone) {
    throw new ContactNoChannelError();
  }
}

export function validateNoDuplicateChannels(
  primaryEmail: string | null | undefined,
  primaryPhone: string | null | undefined,
  additionalChannels: AdditionalChannel[],
): void {
  if (primaryEmail) {
    const dup = additionalChannels.some((c) => c.channel === 'EMAIL' && c.value === primaryEmail);
    if (dup) {
      throw new ContactChannelDuplicatedError('primaryEmail appears in additionalChannels');
    }
  }
  if (primaryPhone) {
    const dup = additionalChannels.some((c) => c.channel === 'PHONE' && c.value === primaryPhone);
    if (dup) {
      throw new ContactChannelDuplicatedError('primaryPhone appears in additionalChannels');
    }
  }
}

export function validateNoIntraArrayDuplicates(
  additionalChannels: AdditionalChannel[],
): void {
  const keys = additionalChannels.map((c) => `${c.channel}:${c.value}`);
  if (new Set(keys).size !== keys.length) {
    throw new ContactChannelDuplicatedError('Duplicate entries in additionalChannels');
  }
}
