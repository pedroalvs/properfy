import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Feature 018 US1: server-side HTML rendering for the public unsubscribe page.
 *
 * Loads the static template once at module-init time, and renders one of four
 * states by building the body HTML inline and interpolating it into the outer
 * template. User-controlled values are HTML-escaped to prevent XSS.
 */

const TEMPLATE_PATH = join(__dirname, 'unsubscribe-page.html');
const TEMPLATE = readFileSync(TEMPLATE_PATH, 'utf-8');

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
}

export interface RenderConfirmInput {
  state: 'confirm';
  recipient: string;
  channel: string;
  token: string;
}

export interface RenderSuccessInput {
  state: 'success';
  recipient: string;
  channel: string;
  /** Optional token to render the "re-subscribe" link on the success page. */
  token?: string;
}

export interface RenderInvalidInput {
  state: 'invalid' | 'expired';
}

export type RenderPageInput = RenderConfirmInput | RenderSuccessInput | RenderInvalidInput;

export function renderUnsubscribePageHtml(input: RenderPageInput): string {
  let bodyHtml: string;

  if (input.state === 'confirm') {
    const escRecipient = escapeHtml(input.recipient);
    const escChannel = escapeHtml(input.channel.toLowerCase());
    const escToken = escapeHtml(input.token);
    bodyHtml = `
      <h1>Unsubscribe</h1>
      <p>You are about to unsubscribe <span class="recipient">${escRecipient}</span> from operational ${escChannel} notifications.</p>
      <p class="muted">Transactional notifications (confirmations, cancellations, reschedules) will continue to be delivered regardless of this choice.</p>
      <form method="POST" action="/v1/notifications/unsubscribe">
        <input type="hidden" name="token" value="${escToken}" />
        <button type="submit" class="button button-primary">Confirm unsubscribe</button>
      </form>
    `;
  } else if (input.state === 'success') {
    const escRecipient = escapeHtml(input.recipient);
    const escChannel = escapeHtml(input.channel.toLowerCase());
    const reOptInForm = input.token
      ? `
        <p class="muted">Changed your mind?</p>
        <form method="POST" action="/v1/notifications/re-opt-in">
          <input type="hidden" name="token" value="${escapeHtml(input.token)}" />
          <button type="submit" class="button button-secondary">Re-subscribe</button>
        </form>
      `
      : '';
    bodyHtml = `
      <h1>You're unsubscribed</h1>
      <p><span class="recipient">${escRecipient}</span> will no longer receive operational ${escChannel} notifications.</p>
      <p class="muted">Transactional notifications (confirmations, cancellations) will still be delivered.</p>
      ${reOptInForm}
    `;
  } else if (input.state === 'expired') {
    bodyHtml = `
      <h1 class="error">Link expired</h1>
      <p>This unsubscribe link has expired. Unsubscribe links are valid for 30 days from the time they are sent.</p>
      <p class="muted">If you continue to receive operational messages and want to opt out, please contact your agency directly.</p>
    `;
  } else {
    bodyHtml = `
      <h1 class="error">Invalid link</h1>
      <p>This unsubscribe link is invalid.</p>
      <p class="muted">If you continue to receive operational messages and want to opt out, please contact your agency directly.</p>
    `;
  }

  return interpolate(TEMPLATE, {
    state: input.state,
    bodyHtml,
  });
}
