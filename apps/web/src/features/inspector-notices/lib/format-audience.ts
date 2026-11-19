import type { InspectorNoticeAudience } from '@properfy/shared';

/**
 * Human label for a notice's audience, as shown in the list and the detail meta.
 * SYSTEM notices (future F04/F08) read "Automatic".
 */
export function formatAudience(audience: InspectorNoticeAudience): string {
  switch (audience.type) {
    case 'ALL':
      return 'All active inspectors';
    case 'SELECTED': {
      const n = audience.inspectorIds.length;
      return `${n} selected inspector${n === 1 ? '' : 's'}`;
    }
    case 'REGION':
      return `Region: ${audience.regionName}`;
    case 'SYSTEM':
      return 'Automatic';
  }
}
