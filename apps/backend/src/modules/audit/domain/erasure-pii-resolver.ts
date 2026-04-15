/**
 * Feature 020 FR-019/FR-019a/FR-019b: resolves a data subject's full set of
 * historical PII values from their current + past user/inspector lifecycle
 * entries, so the erasure scan can find every audit row containing any of
 * those values.
 */

export type DataSubjectIdentifierType = 'user_id' | 'email' | 'phone';

export interface ErasurePiiResolverInput {
  type: DataSubjectIdentifierType;
  value: string;
}

export interface ErasurePiiResolverOutput {
  /** The canonical user id, or null when the input does not resolve to a known user. */
  canonicalUserId: string | null;
  /** Deduplicated set of historical PII values (names, emails, phones) to search for. */
  piiValues: string[];
}

export interface IErasurePiiResolver {
  resolve(input: ErasurePiiResolverInput): Promise<ErasurePiiResolverOutput>;
}
