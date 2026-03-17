import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('twilio', () => {
  return {
    default: vi.fn(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

import { TwilioSmsProvider } from '../../../src/modules/notification/infrastructure/twilio-sms.provider';
import twilio from 'twilio';

describe('TwilioSmsProvider', () => {
  const accountSid = 'AC_test_account_sid';
  const authToken = 'test_auth_token';
  const fromNumber = '+15551234567';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends SMS with correct to, from and body and returns messageId', async () => {
    mockCreate.mockResolvedValue({ sid: 'SM_abc123' });

    const provider = new TwilioSmsProvider(accountSid, authToken, fromNumber);
    const result = await provider.send('+61400000000', 'Hello tenant');

    expect(twilio).toHaveBeenCalledWith(accountSid, authToken);
    expect(mockCreate).toHaveBeenCalledWith({
      to: '+61400000000',
      from: fromNumber,
      body: 'Hello tenant',
    });
    expect(result).toEqual({ messageId: 'SM_abc123' });
  });

  it('uses fromNumber from constructor', async () => {
    const customFrom = '+61400999999';
    mockCreate.mockResolvedValue({ sid: 'SM_xyz789' });

    const provider = new TwilioSmsProvider(accountSid, authToken, customFrom);
    await provider.send('+61400111111', 'Test message');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ from: customFrom }),
    );
  });

  it('propagates errors from Twilio SDK', async () => {
    const twilioError = new Error('Twilio API error: invalid number');
    mockCreate.mockRejectedValue(twilioError);

    const provider = new TwilioSmsProvider(accountSid, authToken, fromNumber);

    await expect(provider.send('+61400000000', 'Hello')).rejects.toThrow(
      'Twilio API error: invalid number',
    );
  });

  it('formats messageId from Twilio sid field', async () => {
    mockCreate.mockResolvedValue({ sid: 'SM_unique_message_id_456' });

    const provider = new TwilioSmsProvider(accountSid, authToken, fromNumber);
    const result = await provider.send('+61400222222', 'Inspection reminder');

    expect(result.messageId).toBe('SM_unique_message_id_456');
  });
});
