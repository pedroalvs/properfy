import { measureSms, SMS_MAX_PARTS, type SmsMeasurement } from './sms-content';
import { renderTemplateWithSamples } from './template-sample-render';

/**
 * Measure the SMS length of a template BODY as it would render with sample values.
 *
 * The length is checked against the SAMPLE_DATA-rendered text (the same source the
 * editor preview uses), NOT the raw template. Trade-off, shared by the preview:
 * SAMPLE_DATA are representative, not maximal, values — an atypically long real
 * value (a long address, a longer portal token than the sample link) can still push
 * a body over the limit at send time, where `prepareSmsBody` truncates as the last
 * line of defence. Callers pass the sample map (SAMPLE_DATA) so this module does not
 * import from `constants/`.
 */
export interface SmsTemplateMeasurement extends SmsMeasurement {
  /** The body after sample substitution — the text the length was measured on. */
  rendered: string;
}

export function measureSmsTemplate(
  body: string,
  samples: Record<string, string>,
): SmsTemplateMeasurement {
  const rendered = renderTemplateWithSamples(body, samples);
  return { ...measureSms(rendered), rendered };
}

/** Operator-facing sentence explaining an over-limit SMS. Same text on web and backend. */
export function describeSmsOverLimit(measurement: SmsMeasurement): string {
  const encodingLabel = measurement.encoding === 'GSM-7' ? 'GSM-7' : 'Unicode (UCS-2)';
  return (
    `SMS renders to ${measurement.length} characters with sample values — over the ` +
    `${measurement.limit} limit for ${encodingLabel} (max ${SMS_MAX_PARTS} parts). ` +
    `Shorten the message.`
  );
}
