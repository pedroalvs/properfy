import { describe, it, expect } from 'vitest';
import {
  createUserSchema,
  updateUserSchema,
  resetUserPasswordSchema,
  listUsersQuerySchema,
  inviteUserSchema,
} from './user';

describe('createUserSchema', () => {
  const validInput = {
    name: 'John Doe',
    email: 'john@example.com',
    password: 'StrongPass1!',
    role: 'CL_ADMIN' as const,
  };

  it('should accept valid input', () => {
    const result = createUserSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept input with all optional fields', () => {
    const result = createUserSchema.safeParse({
      ...validInput,
      branchId: '550e8400-e29b-41d4-a716-446655440000',
      phone: '+61412345678',
    });
    expect(result.success).toBe(true);
  });

  it('should normalize email to lowercase', () => {
    const result = createUserSchema.parse({
      ...validInput,
      email: 'JOHN@EXAMPLE.COM',
    });
    expect(result.email).toBe('john@example.com');
  });

  it('should reject invalid email', () => {
    const result = createUserSchema.safeParse({
      ...validInput,
      email: 'not-valid',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password without uppercase', () => {
    const result = createUserSchema.safeParse({
      ...validInput,
      password: 'weakpass1!',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password without lowercase', () => {
    const result = createUserSchema.safeParse({
      ...validInput,
      password: 'WEAKPASS1!',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password without number', () => {
    const result = createUserSchema.safeParse({
      ...validInput,
      password: 'WeakPass!!',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password without special character', () => {
    const result = createUserSchema.safeParse({
      ...validInput,
      password: 'WeakPass12',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password shorter than 8 characters', () => {
    const result = createUserSchema.safeParse({
      ...validInput,
      password: 'Ab1!',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid role', () => {
    const result = createUserSchema.safeParse({
      ...validInput,
      role: 'SUPER_ADMIN',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing name', () => {
    const { name: _name, ...withoutName } = validInput;
    const result = createUserSchema.safeParse(withoutName);
    expect(result.success).toBe(false);
  });

  it('should accept all valid roles', () => {
    for (const role of ['AM', 'OP', 'CL_ADMIN', 'CL_USER', 'INSP']) {
      const result = createUserSchema.safeParse({ ...validInput, role });
      expect(result.success).toBe(true);
    }
  });
});

describe('updateUserSchema', () => {
  it('should accept partial input', () => {
    const result = updateUserSchema.safeParse({ name: 'Jane Doe' });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept nullable branchId', () => {
    const result = updateUserSchema.safeParse({ branchId: null });
    expect(result.success).toBe(true);
  });

  it('should accept valid uuid branchId', () => {
    const result = updateUserSchema.safeParse({
      branchId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid branchId', () => {
    const result = updateUserSchema.safeParse({ branchId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should accept internal roles', () => {
    for (const role of ['AM', 'OP']) {
      const result = updateUserSchema.safeParse({ role });
      expect(result.success).toBe(true);
    }
  });
});

describe('listUsersQuerySchema', () => {
  it('should accept valid filters', () => {
    const result = listUsersQuerySchema.safeParse({
      status: 'ACTIVE',
      role: 'INSP',
      search: 'john',
      page: 1,
      pageSize: 50,
    });
    expect(result.success).toBe(true);
  });

  it('should apply pagination defaults', () => {
    const result = listUsersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('should reject invalid status', () => {
    const result = listUsersQuerySchema.safeParse({ status: 'DELETED' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid role', () => {
    const result = listUsersQuerySchema.safeParse({ role: 'SUPER_ADMIN' });
    expect(result.success).toBe(false);
  });

  it('should accept all valid roles', () => {
    for (const role of ['AM', 'OP', 'CL_ADMIN', 'CL_USER', 'INSP']) {
      const result = listUsersQuerySchema.safeParse({ role });
      expect(result.success).toBe(true);
    }
  });
});

describe('resetUserPasswordSchema', () => {
  it('should accept a strong password', () => {
    const result = resetUserPasswordSchema.safeParse({
      newPassword: 'StrongPass1!',
    });
    expect(result.success).toBe(true);
  });

  it('should reject a weak password', () => {
    const result = resetUserPasswordSchema.safeParse({
      newPassword: 'weak',
    });
    expect(result.success).toBe(false);
  });
});

describe('AU phone validation on user schemas', () => {
  it('createUserSchema normalizes local phone to E.164', () => {
    const result = createUserSchema.parse({
      name: 'User',
      email: 'user@example.com',
      password: 'Str0ng!Pass',
      role: 'OP',
      phone: '0412 345 678',
    });
    expect(result.phone).toBe('+61412345678');
  });

  it('createUserSchema rejects invalid phone', () => {
    expect(
      createUserSchema.safeParse({
        name: 'User',
        email: 'user@example.com',
        password: 'Str0ng!Pass',
        role: 'OP',
        phone: '555',
      }).success,
    ).toBe(false);
  });

  it('updateUserSchema and inviteUserSchema validate phone', () => {
    expect(updateUserSchema.parse({ phone: '+61 412 345 678' }).phone).toBe('+61412345678');
    expect(updateUserSchema.safeParse({ phone: 'abc' }).success).toBe(false);
    expect(
      inviteUserSchema.parse({ name: 'I', email: 'i@example.com', role: 'CL_USER', phone: '0412345678' }).phone,
    ).toBe('+61412345678');
    expect(
      inviteUserSchema.safeParse({ name: 'I', email: 'i@example.com', role: 'CL_USER', phone: '12' }).success,
    ).toBe(false);
  });
});
