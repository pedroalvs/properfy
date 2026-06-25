import type { NotificationChannel } from '@properfy/shared';

interface TemplatePreviewProps {
  subject: string;
  htmlRendered: string;
  channel: NotificationChannel;
  isLoading?: boolean;
}

export function TemplatePreview({ subject, htmlRendered, channel, isLoading = false }: TemplatePreviewProps) {
  const showSubject = channel === 'EMAIL';

  return (
    <div className="rounded border border-[#E0E0E0] bg-[#FAFAFA] p-4">
      <h4 className="mb-3 text-sm font-bold text-text-secondary">
        Preview
        {isLoading && (
          <span className="ml-2 text-xs font-normal text-text-muted">(updating…)</span>
        )}
      </h4>

      {showSubject && subject && (
        <div className="mb-3">
          <span className="text-xs font-semibold text-text-muted">Subject</span>
          <p className="mt-1 text-sm text-text-primary" data-testid="preview-subject">
            {subject || '(empty)'}
          </p>
        </div>
      )}

      <div>
        {showSubject && <span className="text-xs font-semibold text-text-muted">Body</span>}
        {htmlRendered ? (
          <iframe
            srcDoc={htmlRendered}
            sandbox=""
            title="Email preview"
            data-testid="preview-body"
            className="mt-1 w-full rounded border border-[#E0E0E0] bg-white"
            style={{ minHeight: 200, height: 'auto' }}
            onLoad={(e) => {
              // Auto-resize to content height
              const iframe = e.currentTarget;
              try {
                const body = iframe.contentDocument?.body;
                if (body) {
                  iframe.style.height = `${body.scrollHeight + 32}px`;
                }
              } catch {
                // cross-origin: ignore
              }
            }}
          />
        ) : (
          <p className="mt-1 text-sm italic text-text-muted" data-testid="preview-body">
            (empty)
          </p>
        )}
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
