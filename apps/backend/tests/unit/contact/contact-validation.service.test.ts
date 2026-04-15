import { describe, it, expect } from 'vitest';
import {
  validateAtLeastOneChannel,
  validateNoDuplicateChannels,
  validateNoIntraArrayDuplicates,
} from '../../../src/modules/contact/domain/contact-validation.service';
import { ContactNoChannelError, ContactChannelDuplicatedError } from '../../../src/modules/contact/domain/contact.errors';

describe('validateAtLeastOneChannel', () => {
  it('should pass with email only', () => {
    expect(() => validateAtLeastOneChannel('a@b.com', null)).not.toThrow();
  });

  it('should pass with phone only', () => {
    expect(() => validateAtLeastOneChannel(null, '+61400000000')).not.toThrow();
  });

  it('should pass with both', () => {
    expect(() => validateAtLeastOneChannel('a@b.com', '+61400000000')).not.toThrow();
  });

  it('should throw ContactNoChannelError when both are null', () => {
    expect(() => validateAtLeastOneChannel(null, null)).toThrow(ContactNoChannelError);
  });

  it('should throw ContactNoChannelError when both are undefined', () => {
    expect(() => validateAtLeastOneChannel(undefined, undefined)).toThrow(ContactNoChannelError);
  });
});

describe('validateNoDuplicateChannels', () => {
  it('should pass when no overlap', () => {
    expect(() =>
      validateNoDuplicateChannels('a@b.com', '+61400000000', [
        { channel: 'EMAIL', value: 'other@b.com' },
        { channel: 'PHONE', value: '+61499999999' },
      ]),
    ).not.toThrow();
  });

  it('should pass with empty additionalChannels', () => {
    expect(() => validateNoDuplicateChannels('a@b.com', '+61400000000', [])).not.toThrow();
  });

  it('should throw when primaryEmail is in additionalChannels as EMAIL', () => {
    expect(() =>
      validateNoDuplicateChannels('a@b.com', null, [
        { channel: 'EMAIL', value: 'a@b.com' },
      ]),
    ).toThrow(ContactChannelDuplicatedError);
  });

  it('should throw when primaryPhone is in additionalChannels as PHONE', () => {
    expect(() =>
      validateNoDuplicateChannels(null, '+61400000000', [
        { channel: 'PHONE', value: '+61400000000' },
      ]),
    ).toThrow(ContactChannelDuplicatedError);
  });

  it('should not throw when primaryEmail matches a PHONE channel value (different type)', () => {
    expect(() =>
      validateNoDuplicateChannels('a@b.com', null, [
        { channel: 'PHONE', value: 'a@b.com' }, // unlikely but structurally different
      ]),
    ).not.toThrow();
  });
});

describe('validateNoIntraArrayDuplicates', () => {
  it('should pass with unique entries', () => {
    expect(() =>
      validateNoIntraArrayDuplicates([
        { channel: 'EMAIL', value: 'a@b.com' },
        { channel: 'EMAIL', value: 'c@d.com' },
        { channel: 'PHONE', value: '+61400000000' },
      ]),
    ).not.toThrow();
  });

  it('should pass with empty array', () => {
    expect(() => validateNoIntraArrayDuplicates([])).not.toThrow();
  });

  it('should throw when same channel+value appears twice', () => {
    expect(() =>
      validateNoIntraArrayDuplicates([
        { channel: 'EMAIL', value: 'dup@example.com' },
        { channel: 'EMAIL', value: 'dup@example.com' },
      ]),
    ).toThrow(ContactChannelDuplicatedError);
  });

  it('should pass when same value exists with different channel types', () => {
    expect(() =>
      validateNoIntraArrayDuplicates([
        { channel: 'EMAIL', value: 'shared@example.com' },
        { channel: 'PHONE', value: 'shared@example.com' },
      ]),
    ).not.toThrow();
  });
});
