import type { NotificationChannel } from '@properfy/shared';
import { SAMPLE_DATA, type AllowedVariable } from '../types';

interface TemplatePreviewProps {
  subject: string;
  body: string;
  channel: NotificationChannel;
}

function replaceSampleData(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, variable: string) => {
    const sampleValue = SAMPLE_DATA[variable as AllowedVariable];
    return sampleValue ?? `{{${variable}}}`;
  });
}

export function TemplatePreview({ subject, body, channel }: TemplatePreviewProps) {
  const renderedSubject = replaceSampleData(subject);
  const renderedBody = replaceSampleData(body);
  const showSubject = channel === 'EMAIL';

  return (
    <div className="rounded border border-[#E0E0E0] bg-[#FAFAFA] p-4">
      <h4 className="mb-3 text-sm font-bold text-text-secondary">Preview</h4>

      {showSubject && (
        <div className="mb-3">
          <span className="text-xs font-semibold text-text-muted">Subject</span>
          <p className="mt-1 text-sm text-text-primary" data-testid="preview-subject">
            {renderedSubject || '(empty)'}
          </p>
        </div>
      )}

      <div>
        {showSubject && <span className="text-xs font-semibold text-text-muted">Body</span>}
        <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary" data-testid="preview-body">
          {renderedBody || '(empty)'}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Channel:
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          {channel}
        </span>
      </div>
    </div>
  );
}
