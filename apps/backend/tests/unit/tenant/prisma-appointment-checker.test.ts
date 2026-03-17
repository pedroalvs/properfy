import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaAppointmentChecker } from '../../../src/modules/tenant/infrastructure/prisma-appointment-checker';

function makePrisma(countResult: number) {
  return {
    appointment: {
      count: vi.fn().mockResolvedValue(countResult),
    },
  } as any;
}

describe('PrismaAppointmentChecker', () => {
  describe('hasOpenAppointmentsForTenant', () => {
    it('should return true when count > 0', async () => {
      const prisma = makePrisma(3);
      const checker = new PrismaAppointmentChecker(prisma);

      const result = await checker.hasOpenAppointmentsForTenant('tenant-1');

      expect(result).toBe(true);
      expect(prisma.appointment.count).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-1',
          status: { in: ['DRAFT', 'AWAITING_INSPECTOR', 'SCHEDULED'] },
        },
      });
    });

    it('should return false when count is 0', async () => {
      const prisma = makePrisma(0);
      const checker = new PrismaAppointmentChecker(prisma);

      const result = await checker.hasOpenAppointmentsForTenant('tenant-1');

      expect(result).toBe(false);
    });
  });

  describe('hasOpenAppointmentsForBranch', () => {
    it('should return true when count > 0', async () => {
      const prisma = makePrisma(1);
      const checker = new PrismaAppointmentChecker(prisma);

      const result = await checker.hasOpenAppointmentsForBranch('branch-1');

      expect(result).toBe(true);
      expect(prisma.appointment.count).toHaveBeenCalledWith({
        where: {
          branch_id: 'branch-1',
          status: { in: ['DRAFT', 'AWAITING_INSPECTOR', 'SCHEDULED'] },
        },
      });
    });

    it('should return false when count is 0', async () => {
      const prisma = makePrisma(0);
      const checker = new PrismaAppointmentChecker(prisma);

      const result = await checker.hasOpenAppointmentsForBranch('branch-1');

      expect(result).toBe(false);
    });
  });

  describe('hasOpenAppointmentsForProperty', () => {
    it('should return true when count > 0', async () => {
      const prisma = makePrisma(2);
      const checker = new PrismaAppointmentChecker(prisma);

      const result = await checker.hasOpenAppointmentsForProperty('prop-1');

      expect(result).toBe(true);
      expect(prisma.appointment.count).toHaveBeenCalledWith({
        where: {
          property_id: 'prop-1',
          status: { in: ['DRAFT', 'AWAITING_INSPECTOR', 'SCHEDULED'] },
        },
      });
    });

    it('should return false when count is 0', async () => {
      const prisma = makePrisma(0);
      const checker = new PrismaAppointmentChecker(prisma);

      const result = await checker.hasOpenAppointmentsForProperty('prop-1');

      expect(result).toBe(false);
    });
  });
});
