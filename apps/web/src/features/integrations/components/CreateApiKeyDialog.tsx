import { useEffect, useState } from 'react';
import { PLATFORM_TIMEZONE, endOfCivilDayInTz } from '@properfy/shared';
import type { ApiKeyCreated, ApiKeyScope } from '@properfy/shared';

import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { TextInput } from '@/components/forms/TextInput';
import { DateInput } from '@/components/forms/DateInput';
import { SecretValue } from '@/components/ui/SecretValue';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useCreateApiKey } from '../hooks/useApiKeys';

import { FY_KEY_ROLE, FY_SCOPE } from './fyKey';

interface CreateApiKeyDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Create flow: form dialog followed by the show-once plaintext dialog.
 * Every key is created with the `bot:fy` scope — inbound API access is
 * restricted to the Fy agent surface, there is no general machine principal.
 */
export function CreateApiKeyDialog({ open, onClose }: CreateApiKeyDialogProps) {
  const { showError } = useSnackbar();
  const createKey = useCreateApiKey();

  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);

  const scopes: ApiKeyScope[] = [FY_SCOPE];

  const reset = () => {
    setName('');
    setExpiresAt('');
  };

  // Fresh form on every open — cancelled input must not leak into the next create.
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCreate = async () => {
    try {
      const created = await createKey.mutateAsync({
        name: name.trim(),
        role: FY_KEY_ROLE,
        scopes,
        // Sydney end-of-day, regardless of where the operator is located.
        expiresAt: expiresAt ? endOfCivilDayInTz(expiresAt, PLATFORM_TIMEZONE).toISOString() : null,
      });
      reset();
      onClose();
      setCreatedKey(created);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to create the API key');
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="New Fy key"
        actions={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={createKey.isPending} disabled={!name.trim()}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-text-secondary">Name</span>
            <TextInput
              value={name}
              onChange={setName}
              placeholder="e.g. Fy production"
              aria-label="API key name"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-text-secondary">
              Expiry date (optional)
            </span>
            <DateInput value={expiresAt} onChange={setExpiresAt} aria-label="API key expiry date" />
          </label>
        </div>
      </Dialog>

      <Dialog
        open={createdKey !== null}
        onClose={() => setCreatedKey(null)}
        title="API key created"
        actions={<Button onClick={() => setCreatedKey(null)}>Done</Button>}
      >
        {createdKey && (
          <div className="space-y-3">
            <p className="text-sm">
              Copy the key now — <strong>it will not be shown again</strong>.
            </p>
            <div className="rounded bg-black/5 px-3 py-2">
              <SecretValue value={createdKey.key} maskable label="API key" />
            </div>
            <p className="text-xs text-muted">
              Send it in the <code className="font-mono">X-API-Key</code> header on every request.
            </p>
          </div>
        )}
      </Dialog>
    </>
  );
}
