import { unstable_usePrompt } from 'react-router-dom';

/** Blocks in-app navigation when the user has unsaved changes. */
export function useUnsavedChangesPrompt(
  isDirty: boolean,
  message = 'You have unsaved changes. Leave anyway?',
): void {
  unstable_usePrompt({ when: isDirty, message });
}
