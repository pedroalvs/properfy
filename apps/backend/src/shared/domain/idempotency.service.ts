export interface IdempotencyRecord<T = unknown> {
  response: T;
  payloadHash: string | null;
}

export interface IIdempotencyService {
  get<T = unknown>(key: string, scope: string): Promise<T | null>;
  getWithHash<T = unknown>(key: string, scope: string): Promise<IdempotencyRecord<T> | null>;
  set<T = unknown>(key: string, scope: string, response: T, ttlHours: number, payloadHash?: string): Promise<void>;
}
