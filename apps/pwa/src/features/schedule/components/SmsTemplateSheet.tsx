import { MessageSquare } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { Button } from '@/components/ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/Sheet';
import { SMS_TEMPLATES } from '../lib/sms-templates';
import { buildSmsUrl } from '../lib/sms-url';

interface SmsTemplateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The contact being messaged (shown in the header). */
  contactName: string;
  /** The recipient phone number. */
  phone: string;
  /**
   * The inspector's first name, used to sign each message. Presentational on
   * purpose — the caller reads it from `useAuth`, so this sheet stays pure and
   * testable without an auth provider.
   */
  firstName?: string | null;
}

/**
 * Bottom sheet of pre-written SMS templates. Tapping one opens the native
 * messaging app (`sms:` deep link) with the recipient and a signed message body
 * pre-filled — the inspector never types a routine arrival/access update.
 */
export function SmsTemplateSheet({
  open,
  onOpenChange,
  contactName,
  phone,
  firstName,
}: SmsTemplateSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Message {contactName}</SheetTitle>
          <SheetDescription>{phone}</SheetDescription>
        </SheetHeader>

        <ul className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {SMS_TEMPLATES.map((template) => {
            const body = template.build(firstName);
            return (
              <li key={template.id}>
                <a
                  href={buildSmsUrl(phone, body)}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    'flex min-h-touch items-start gap-3 rounded-card border border-border px-4 py-3 text-left',
                    'hover:bg-muted active:bg-muted',
                  )}
                  data-testid={`sms-template-${template.id}`}
                >
                  <MessageSquare
                    className="mt-0.5 h-5 w-5 shrink-0 text-success"
                    aria-hidden="true"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-foreground">{template.label}</span>
                    <span className="text-xs text-muted-foreground">{body}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>

        <Button variant="outlined" block className="mt-4" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </SheetContent>
    </Sheet>
  );
}
