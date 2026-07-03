export interface SuccessEnvelope<T> {
  data: T;
}

export function unwrapSuccessData<T>(response: SuccessEnvelope<T> | undefined): T | undefined {
  return response?.data;
}
