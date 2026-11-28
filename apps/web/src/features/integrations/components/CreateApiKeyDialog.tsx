import { useEffect, useState } from 'react';
import { endOfCivilDayInTz } from '@properfy/shared';
import type { ApiKeyCreated, ApiKeyScope } from '@properfy/shared';

import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { TextInput } from '@/components/forms/TextInput';
import { DateInput } from '@/components/forms/DateInput';
import { SecretValue } from '@/components/ui/SecretValue';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useCreateApiKey } from '../hooks/useApiKeys';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';

import { FY_KEY_TYPE, type MachineKeyType } from './machineKeyType';

interface CreateApiKeyDialogProps {
  open: boolean;
  onClose: () => void;
  /** Which integration this key belongs to — fixes the role/scope and the copy. */
  keyType?: MachineKeyType;
}

/**
 * Create flow: form dialog followed by the show-once plaintext dialog.
 * The role and scope are fixed by the integration (`keyType`) — never chosen in
 * the UI — so inbound access stays confined to that integration's surface.
 */
export function CreateApiKeyDialog({ open, onClose, keyType = FY_KEY_TYPE }: CreateApiKeyDialogProps) {
  const effectiveTimezone = useEffectiveTimezone();
  const { showError } = useSnackbar();
  const createKey = useCreateApiKey();

  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);

  const scopes: ApiKeyScope[] = [keyType.scope];

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
        role: keyType.role,
        scopes,
        // End-of-day in the user's effective timezone, wherever they are located.
        expiresAt: expiresAt ? endOfCivilDayInTz(expiresAt, effectiveTimezone).toISOString() : null,
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
        title={keyType.newKeyLabel}
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
          <label htmlFor="create-api-key-name" className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-text-secondary">Name</span>
            <TextInput
              id="create-api-key-name"
              value={name}
              onChange={setName}
              placeholder={keyType.namePlaceholder}
              aria-label="API key name"
            />
          </label>
          <label htmlFor="create-api-key-expiry" className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-text-secondary">
              Expiry date (optional)
            </span>
            <DateInput
              id="create-api-key-expiry"
              value={expiresAt}
              onChange={setExpiresAt}
              aria-label="API key expiry date"
            />
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
