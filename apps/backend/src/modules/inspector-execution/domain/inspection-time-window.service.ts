/**
 * Re-export from shared domain for backward compatibility.
 * The canonical location is `src/shared/domain/inspection-time-window.service.ts`.
 *
 * Feature 006 (force-confirmation / reschedule) and any other module
 * that needs time-window validation should import directly from
 * `../../../../shared/domain/inspection-time-window.service` or from here.
 */
export {
  InspectionTimeWindowService,
  type InspectionTimeWindowBounds,
} from '../../../shared/domain/inspection-time-window.service';
