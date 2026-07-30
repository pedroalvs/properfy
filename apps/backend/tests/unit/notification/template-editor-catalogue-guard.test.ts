import { describe, it, expect } from 'vitest';
import {
  ALLOWED_VARIABLES,
  MANDATORY_TEMPLATE_CODES,
  TEMPLATE_VARIABLES,
  findTemplateVariableIssues,
} from '@properfy/shared';
import { PLATFORM_TEMPLATES } from '../../../src/modules/notification/domain/platform-notification-templates';

/**
 * The template editor validates an operator's content with
 * `findTemplateVariableIssues`. Nothing used to check that the content Properfy
 * itself ships can clear that bar, so the two drifted: `SERVICE_LABEL` introduced
 * `{{else}}`, the editor's extractor read it as a variable named `else`, and all
 * ten appointment emails became impossible to save — in every environment, with no
 * failing test anywhere.
 *
 * This is that missing check. A template an operator can open must be a template
 * an operator can save unchanged.
 */
describe('shipped templates satisfy the template editor', () => {
  const editable = PLATFORM_TEMPLATES.filter((t) =>
    (MANDATORY_TEMPLATE_CODES as readonly string[]).includes(t.code),
  );

  it('covers every editable template', () => {
    expect(editable.length).toBeGreaterThan(0);
  });

  it.each(editable.map((t) => [`${t.code} (${t.channel})`, t] as const))(
    '%s saves unchanged',
    (_label, template) => {
      const spec = TEMPLATE_VARIABLES[template.code as keyof typeof TEMPLATE_VARIABLES];
      const allowed = spec ? [...spec.required, ...spec.optional] : ALLOWED_VARIABLES;
      const required = spec ? [...spec.required] : [];
      // Exactly what the editor validates: subject plus the one body an operator
      // can actually see and edit. Feeding it both fields would let a required
      // variable that appears only in the unused one count as used, so the guard
      // would pass while the editor still refused the save.
      const body = template.channel === 'EMAIL' ? template.bodyHtml ?? '' : template.body ?? '';
      const content = [template.subject ?? '', body].join(' ');

      expect(findTemplateVariableIssues(content, { required, allowed })).toEqual({
        invalid: [],
        missing: [],
      });
    },
  );
});
