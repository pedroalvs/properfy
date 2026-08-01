export interface IdempotencyRecord<T = unknown> {
  response: T;
  payloadHash: string | null;
}

export type IdempotencyAcquireResult<T = unknown> =
  | { status: 'acquired'; ownerToken: string }
  | { status: 'in_progress'; payloadHash: string | null }
  | { status: 'completed'; response: T; payloadHash: string | null };

export interface IIdempotencyService {
  get<T = unknown>(key: string, scope: string): Promise<T | null>;
  getWithHash<T = unknown>(key: string, scope: string): Promise<IdempotencyRecord<T> | null>;
  tryAcquire<T = unknown>(
    key: string,
    scope: string,
    payloadHash: string,
    ttlHours: number,
  ): Promise<IdempotencyAcquireResult<T>>;
  complete<T = unknown>(
    key: string,
    scope: string,
    ownerToken: string,
    response: T,
    ttlHours: number,
    payloadHash: string,
  ): Promise<boolean>;
  renew(
    key: string,
    scope: string,
    payloadHash: string,
    ownerToken: string,
    ttlHours: number,
  ): Promise<boolean>;
  release(key: string, scope: string, payloadHash: string, ownerToken: string): Promise<void>;
  set<T = unknown>(key: string, scope: string, response: T, ttlHours: number, payloadHash?: string): Promise<void>;
}
