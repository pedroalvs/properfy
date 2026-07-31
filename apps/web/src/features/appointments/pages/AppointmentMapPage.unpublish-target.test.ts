/**
 * Regression: UNPUBLISH from the group popup must survive the popup closing.
 *
 * `GroupMapDetailPanel` dismisses itself on any document mousedown outside its
 * card (exempting only markers and the Mapbox canvas). The unpublish
 * confirmation is a page-level Dialog, so opening it and clicking inside it
 * both land outside the card — the panel calls `onClose`, and the page clears
 * `previewGroup`.
 *
 * If the mutation were bound to `previewGroup?.id`, that dismissal would leave
 * the modal on screen wired to a null id, and `useUnpublishServiceGroup`
 * early-returns on a null id — so confirming would silently do nothing, with
 * no request and no error. The fix is to capture the id when the modal opens
 * and bind the mutation to that.
 *
 * Asserted against the page source: a behavioural test of this page needs a
 * full Mapbox runtime, which is impractical in jsdom (same reasoning as
 * AppointmentMapPage.marker-click.test.ts).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE_SOURCE = readFileSync(resolve(__dirname, './AppointmentMapPage.tsx'), 'utf8');

describe('AppointmentMapPage — unpublish target survives popup dismissal', () => {
  it('binds the unpublish mutation to the captured target id, never to previewGroup', () => {
    const hookCall = PAGE_SOURCE.match(/useUnpublishServiceGroup\(([\s\S]*?),\s*\(\)\s*=>/);
    expect(hookCall, 'useUnpublishServiceGroup call not found').toBeTruthy();

    const idArgument = hookCall![1]!;
    expect(idArgument).toContain('unpublishTargetId');
    // The whole point of the regression: previewGroup is cleared by the
    // panel's outside-click handler before the confirm ever fires.
    expect(idArgument).not.toContain('previewGroup');
  });

  it('captures the group id when the popup opens the modal', () => {
    expect(PAGE_SOURCE).toContain('onUnpublish={() => setUnpublishTargetId(previewGroup.id)}');
  });

  it('drives the modal from the captured id rather than a separate open flag', () => {
    // A separate boolean could drift out of sync with the id and reintroduce
    // the "modal open, id null" state this regression is about.
    expect(PAGE_SOURCE).toContain('open={unpublishTargetId !== null}');
    expect(PAGE_SOURCE).not.toContain('unpublishOpen');
  });
});
