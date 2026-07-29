import { useState } from 'react';
import { ViewportAwareDropdown } from '@/components/ui/ViewportAwareDropdown';

interface ServiceGroupActionsMenuProps {
  /** ACCEPTED groups replace their inspector rather than gaining one. */
  isReplacement: boolean;
  onChangeInspector: () => void;
  onChangeDate: () => void;
  onChangeTimeWindow: () => void;
}

const ITEM_CLASS =
  'flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-black/5';

/**
 * The group's plan edits, kept together and out of the lifecycle button row —
 * transitions (Publish / Cancel / Reject) stay buttons, plan edits live here.
 */
export function ServiceGroupActionsMenu({
  isReplacement,
  onChangeInspector,
  onChangeDate,
  onChangeTimeWindow,
}: ServiceGroupActionsMenuProps) {
  // ViewportAwareDropdown owns `open` internally and its outside-click handler
  // ignores clicks inside the menu, so picking an item would leave it hanging
  // open behind the dialog. Remounting via `key` resets it.
  const [menuEpoch, setMenuEpoch] = useState(0);

  const select = (action: () => void) => () => {
    setMenuEpoch((e) => e + 1);
    action();
  };

  return (
    <ViewportAwareDropdown
      key={menuEpoch}
      placement="auto"
      menuMinWidth={224}
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-black/5"
          data-testid="service-group-change-trigger"
        >
          Change
          <i className="mdi mdi-chevron-down text-base" aria-hidden="true" />
        </button>
      }
    >
      <div role="menu">
        <button
          type="button"
          role="menuitem"
          className={ITEM_CLASS}
          onClick={select(onChangeInspector)}
          data-testid="group-action-change-inspector"
        >
          <i className="mdi mdi-account-switch text-base text-text-muted" aria-hidden="true" />
          {isReplacement ? 'Change inspector' : 'Assign inspector'}
        </button>
        <button
          type="button"
          role="menuitem"
          className={ITEM_CLASS}
          onClick={select(onChangeDate)}
          data-testid="group-action-change-date"
        >
          <i className="mdi mdi-calendar-edit text-base text-text-muted" aria-hidden="true" />
          Change date
        </button>
        <button
          type="button"
          role="menuitem"
          className={ITEM_CLASS}
          onClick={select(onChangeTimeWindow)}
          data-testid="group-action-change-time-window"
        >
          <i className="mdi mdi-clock-edit-outline text-base text-text-muted" aria-hidden="true" />
          Change time window
        </button>
      </div>
    </ViewportAwareDropdown>
  );
}
