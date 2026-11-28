/**
 * Pre-written SMS messages an inspector can send to a tenant contact from the
 * appointment-detail Contacts card. Each template produces a body signed with
 * the inspector's first name ("Hi, it's John, your property inspector. …"),
 * falling back to "Hi, it's your property inspector. …" when no name is known.
 *
 * Bodies deliberately use straight apostrophes and hyphens (no em dash or curly
 * quotes) so the message stays GSM-7 and does not silently become a multi-part
 * UCS-2 SMS.
 */

export interface SmsTemplate {
  id: string;
  /** Short label shown in the picker. */
  label: string;
  /** Builds the full message body, signed with the inspector's first name. */
  build: (firstName?: string | null) => string;
}

function signature(firstName?: string | null): string {
  const name = firstName?.trim();
  return name ? `${name}, your property inspector` : 'your property inspector';
}

function message(firstName: string | null | undefined, rest: string): string {
  return `Hi, it's ${signature(firstName)}. ${rest}`;
}

export const SMS_TEMPLATES: SmsTemplate[] = [
  {
    id: 'on-my-way',
    label: 'On my way',
    build: (firstName) => message(firstName, "I'm on my way and should arrive shortly."),
  },
  {
    id: 'running-late',
    label: 'Running late',
    build: (firstName) =>
      message(
        firstName,
        "I'm running a little late - I'll be there as soon as I can. Thanks for your patience.",
      ),
  },
  {
    id: 'waiting-outside',
    label: 'Waiting outside',
    build: (firstName) => message(firstName, "I've arrived and I'm waiting outside the property."),
  },
  {
    id: 'couldnt-reach',
    label: "Couldn't reach you",
    build: (firstName) =>
      message(firstName, "I'm at the property but couldn't reach you. Could you please call me back?"),
  },
  {
    id: 'no-access',
    label: "Can't get access",
    build: (firstName) =>
      message(firstName, "I'm here but can't access the property. How should I get in?"),
  },
];
