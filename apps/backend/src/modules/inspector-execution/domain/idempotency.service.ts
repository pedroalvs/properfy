export interface IIdempotencyService {
  get<T = unknown>(key: string, scope: string): Promise<T | null>;
  set<T = unknown>(key: string, scope: string, response: T, ttlHours: number): Promise<void>;
}
