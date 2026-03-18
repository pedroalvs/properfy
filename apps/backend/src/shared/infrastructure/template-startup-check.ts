import type { Logger } from './logger';
import { MANDATORY_TEMPLATE_CODES } from '../../modules/notification/domain/notification.constants';
import { prisma } from './prisma';

export async function checkMandatoryTemplates(logger: Logger): Promise<void> {
  try {
    const existingTemplates = await prisma.notificationTemplate.findMany({
      where: { tenant_id: null },
      select: { template_code: true },
    });

    const existingCodes = new Set(existingTemplates.map((t) => t.template_code));
    const missingCodes: string[] = [];

    for (const code of MANDATORY_TEMPLATE_CODES) {
      if (!existingCodes.has(code)) {
        missingCodes.push(code);
      }
    }

    if (missingCodes.length > 0) {
      logger.warn(
        { missingCodes, missingCount: missingCodes.length, totalRequired: MANDATORY_TEMPLATE_CODES.length },
        `Missing ${missingCodes.length} mandatory notification templates (default/global). Create them to enable all notification flows.`,
      );
    } else {
      logger.info('All mandatory notification templates are present');
    }
  } catch (err) {
    logger.warn(
      { error: err },
      'Could not check mandatory notification templates at startup (non-fatal)',
    );
  }
}
