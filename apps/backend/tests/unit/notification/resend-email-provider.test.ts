import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResendEmailProvider } from '../../../src/modules/notification/infrastructure/resend-email.provider';

const mockSend = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

describe('ResendEmailProvider', () => {
  const apiKey = 're_test_api_key';
  const fromEmail = 'noreply@properfy.com.au';
  let provider: ResendEmailProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ResendEmailProvider(apiKey, fromEmail);
  });

  it('sends email with correct parameters and returns messageId', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg-123' }, error: null });

    const result = await provider.send(
      'tenant@example.com',
      'Inspection Notice',
      '<p>Hello</p>',
      'Hello',
    );

    expect(mockSend).toHaveBeenCalledWith({
      from: fromEmail,
      to: 'tenant@example.com',
      subject: 'Inspection Notice',
      html: '<p>Hello</p>',
      text: 'Hello',
    });
    expect(result).toEqual({ messageId: 'msg-123' });
  });

  it('passes from address from constructor config', async () => {
    const customFrom = 'custom@properfy.com.au';
    const customProvider = new ResendEmailProvider(apiKey, customFrom);
    mockSend.mockResolvedValue({ data: { id: 'msg-456' }, error: null });

    await customProvider.send('user@example.com', 'Subject', '<p>Body</p>', 'Body');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: customFrom }),
    );
  });

  it('includes the configured global recipient as a hidden copy', async () => {
    const bccRecipient = 'supervision@properfy.com.au';
    const providerWithBcc = new ResendEmailProvider(apiKey, fromEmail, bccRecipient);
    mockSend.mockResolvedValue({ data: { id: 'msg-bcc' }, error: null });

    await providerWithBcc.send('user@example.com', 'Subject', '<p>Body</p>', 'Body');

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ bcc: bccRecipient }));
  });

  it('omits the hidden-copy field when no global recipient is configured', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg-no-bcc' }, error: null });

    await provider.send('user@example.com', 'Subject', '<p>Body</p>', 'Body');

    expect(mockSend).toHaveBeenCalledWith(expect.not.objectContaining({ bcc: expect.anything() }));
  });

  it('propagates errors from Resend SDK', async () => {
    const sdkError = new Error('Resend rate limit exceeded');
    mockSend.mockRejectedValue(sdkError);

    await expect(
      provider.send('user@example.com', 'Subject', '<p>Body</p>', 'Body'),
    ).rejects.toThrow('Resend rate limit exceeded');
  });

  it('throws when Resend API returns null data', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key', name: 'validation_error' },
    });

    await expect(
      provider.send('user@example.com', 'Subject', '<p>Body</p>', 'Body'),
    ).rejects.toThrow('Resend API returned no data');
  });

  it('handles both HTML and text body', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg-789' }, error: null });

    const htmlBody = '<h1>Inspection</h1><p>Details here</p>';
    const textBody = 'Inspection\nDetails here';

    await provider.send('user@example.com', 'Report', htmlBody, textBody);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        html: htmlBody,
        text: textBody,
      }),
    );
  });
});
