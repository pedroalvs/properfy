import type { NotificationChannel } from '@properfy/shared';

interface TemplatePreviewProps {
  subject: string;
  htmlRendered: string;
  channel: NotificationChannel;
  isLoading?: boolean;
  /** Backend render failure (e.g. a Handlebars syntax error) shown above the body. */
  renderError?: string;
}

export function TemplatePreview({
  subject,
  htmlRendered,
  channel,
  isLoading = false,
  renderError,
}: TemplatePreviewProps) {
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

      {renderError && (
        <p
          className="mb-3 rounded border border-error/40 bg-error/5 px-3 py-2 font-mono text-xs text-error"
          data-testid="preview-error"
          role="alert"
        >
          {renderError}
        </p>
      )}

      <div>
        {showSubject && <span className="text-xs font-semibold text-text-muted">Body</span>}
        {htmlRendered ? (
          <iframe
            srcDoc={htmlRendered}
            // allow-same-origin (and nothing else): scripts stay blocked, but
            // the frame keeps our origin so the onLoad height measurement can
            // read contentDocument. With sandbox="" the origin is opaque, the
            // read throws, and the preview stayed clipped at 200px forever —
            // hiding the footer logo below the fold.
            sandbox="allow-same-origin"
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
