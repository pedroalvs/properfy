// Shared HTML layout for appointment-related platform email templates.
// Ported from the client-approved reference email: dark background, wide
// greeting header, 460px content column, pink links, amber call-out box and
// a conditional agency logo footer. The header artwork of the original is
// reproduced with a pure-CSS gradient so the layout has no external asset
// dependency (only the per-agency logo, hosted by the agency, is an <img>).
//
// Everything here must stay within the notification sanitizer allowlist
// (sanitize-html.service.ts): inline styles, tables and https images only.

export const EMAIL_LINK_STYLE = 'color:rgb(219,151,255);text-decoration:underline;';

export const EMAIL_CALLOUT_STYLE =
  'background-color:rgb(94,86,54);padding:12px;border-left:4px solid rgb(255,193,7);';

const BODY_STYLE =
  'margin:0;padding:0;background-color:rgb(47,47,47);color:#ffffff;' +
  'font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;';

const HEADER_STYLE =
  'background-color:rgb(41,41,41);' +
  'background-image:linear-gradient(115deg,rgba(233,74,111,0.45) 0%,rgba(233,74,111,0.12) 38%,rgba(41,41,41,0) 62%);';

const FOOTER_LOGO_BLOCK =
  '{{#if agencyLogoUrl}}' +
  '<tr><td style="padding:20px 30px 30px 30px;">' +
  '<img src="{{agencyLogoUrl}}" alt="{{agencyName}}" width="199" ' +
  'style="display:block;max-width:199px;max-height:70px;outline:0;">' +
  '</td></tr>' +
  '{{/if}}';

export interface AppointmentEmailContent {
  /** Heading rendered as the big header title (e.g. "Dear {{rentalTenantName}}"). */
  heading: string;
  /** Inner HTML of the content column — a sequence of <p> blocks. */
  contentHtml: string;
}

export function renderAppointmentEmailHtml(content: AppointmentEmailContent): string {
  return (
    '<html lang="en"><body style="' + BODY_STYLE + '">' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="background-color:rgb(47,47,47);border-collapse:collapse;">' +
    '<tr><td align="center" style="padding:0;">' +
    '<table width="520" cellpadding="0" cellspacing="0" border="0" ' +
    'style="max-width:520px;width:100%;background-color:rgb(47,47,47);border-collapse:collapse;text-align:left;">' +
    // Header
    '<tr><td style="' + HEADER_STYLE + 'padding:30px;">' +
    '<h1 style="margin:0;font-size:32px;font-family:Arial,Helvetica,sans-serif;font-weight:700;color:#ffffff;">' +
    content.heading +
    '</h1></td></tr>' +
    // Content column
    '<tr><td style="padding:20px 30px 0 30px;color:#ffffff;">' +
    content.contentHtml +
    '</td></tr>' +
    // Footer logo (per-agency, optional)
    FOOTER_LOGO_BLOCK +
    '</table>' +
    '</td></tr></table>' +
    '</body></html>'
  );
}

/** Convenience wrapper for the common tenant-facing greeting. */
export function tenantEmailHtml(contentHtml: string): string {
  return renderAppointmentEmailHtml({ heading: 'Dear {{rentalTenantName}}', contentHtml });
}

// ── System email layout ──────────────────────────────────────────────────────
// Properfy-branded light layout for platform/system emails (password reset,
// report notifications, internal ops alerts). Visual language follows the
// tenant portal "Coral Clean" redesign: light gray canvas, white rounded card,
// coral (#F37A76) accents and the Properfy logo on top. These templates are
// not tenant-customizable, so the logo is a fixed https asset served by the
// production web app.

const PROPERFY_LOGO_URL = 'https://properfy.autolabs.tech/images/properfy-logo-red.png';

const SYSTEM_BODY_STYLE =
  'margin:0;padding:0;background-color:#F5F5F5;color:rgba(0,0,0,0.87);' +
  'font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;';

const SYSTEM_CARD_STYLE =
  'background-color:#FFFFFF;border:1px solid #ECECEC;border-top:4px solid #F37A76;' +
  'border-radius:12px;padding:32px;text-align:left;';

export const SYSTEM_CTA_STYLE =
  'display:inline-block;background-color:#F37A76;color:#FFFFFF;font-weight:700;' +
  'font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;';

export const SYSTEM_NOTE_STYLE =
  'background-color:#FDEEED;border:1px solid #F8C6C4;border-radius:8px;padding:12px 16px;' +
  'color:rgba(0,0,0,0.7);font-size:13px;';

export interface SystemEmailContent {
  /** Card title (e.g. "Reset your password"). */
  heading: string;
  /** Inner HTML of the card below the heading. */
  contentHtml: string;
}

export function renderSystemEmailHtml(content: SystemEmailContent): string {
  return (
    '<html lang="en"><body style="' + SYSTEM_BODY_STYLE + '">' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="background-color:#F5F5F5;border-collapse:collapse;">' +
    '<tr><td align="center" style="padding:32px 16px;">' +
    '<table width="480" cellpadding="0" cellspacing="0" border="0" ' +
    'style="max-width:480px;width:100%;border-collapse:collapse;text-align:left;">' +
    '<tr><td style="padding:0 0 20px 0;" align="center">' +
    '<img src="' + PROPERFY_LOGO_URL + '" alt="Properfy" width="150" ' +
    'style="display:block;max-width:150px;outline:0;">' +
    '</td></tr>' +
    '<tr><td style="' + SYSTEM_CARD_STYLE + '">' +
    '<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:800;color:#21566E;">' +
    content.heading +
    '</h1>' +
    content.contentHtml +
    '</td></tr>' +
    '<tr><td align="center" style="padding:20px 0 0 0;color:rgb(158,158,158);font-size:12px;">' +
    'This is an automated message from Properfy — please do not reply.' +
    '</td></tr>' +
    '</table>' +
    '</td></tr></table>' +
    '</body></html>'
  );
}
