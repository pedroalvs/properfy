import { useEffect, useState } from 'react';
import type { ApiKeyCreated, ApiKeyRole, ApiKeyScope } from '@properfy/shared';

import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { TextInput } from '@/components/forms/TextInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { DateInput } from '@/components/forms/DateInput';
import { SecretValue } from '@/components/ui/SecretValue';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useCreateApiKey } from '../hooks/useApiKeys';

const ROLE_OPTIONS = [
  { value: 'OP', label: 'Operator (OP)' },
  { value: 'AM', label: 'Admin Master (AM)' },
];

export const FY_SCOPE: ApiKeyScope = 'bot:fy';

interface CreateApiKeyDialogProps {
  open: boolean;
  onClose: () => void;
  /** Locks the key to these scopes and hides the scope picker (e.g. Fy Agent tab). */
  presetScopes?: ApiKeyScope[];
  defaultName?: string;
}

/**
 * Shared create flow: form dialog followed by the show-once plaintext dialog.
 * Scopes restrict a key to a dedicated machine surface (e.g. `bot:fy` → the
 * Fy agent API); a key without scopes is a general machine principal.
 */
export function CreateApiKeyDialog({
  open,
  onClose,
  presetScopes,
  defaultName = '',
}: CreateApiKeyDialogProps) {
  const { showError } = useSnackbar();
  const createKey = useCreateApiKey();

  const [name, setName] = useState(defaultName);
  const [role, setRole] = useState<ApiKeyRole>('OP');
  const [expiresAt, setExpiresAt] = useState('');
  const [fyScope, setFyScope] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);

  const scopes: ApiKeyScope[] = presetScopes ?? (fyScope ? [FY_SCOPE] : []);

  const reset = () => {
    setName(defaultName);
    setRole('OP');
    setExpiresAt('');
    setFyScope(false);
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
        role,
        scopes,
        // Local end-of-day, so the expiry lands on the day the operator picked.
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59.999`).toISOString() : null,
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
        title={presetScopes ? 'New Fy API key' : 'New API key'}
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
              placeholder={presetScopes ? 'e.g. Fy agent (AutoLabs)' : 'e.g. n8n automation'}
              aria-label="API key name"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-text-secondary">Role</span>
            <SelectInput
              value={role}
              onChange={(value) => setRole(value as ApiKeyRole)}
              options={ROLE_OPTIONS}
              aria-label="API key role"
            />
          </label>
          {presetScopes ? (
            <p className="text-xs text-text-secondary">
              Scope: <code className="font-mono">{presetScopes.join(', ')}</code> — this key can only
              call the Fy agent API.
            </p>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fyScope}
                onChange={(event) => setFyScope(event.target.checked)}
                aria-label="Fy Agent scope"
              />
              <span>
                Fy Agent scope (<code className="font-mono text-xs">bot:fy</code>)
              </span>
            </label>
          )}
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
