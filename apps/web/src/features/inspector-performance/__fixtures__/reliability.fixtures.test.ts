import { describe, it, expect } from 'vitest';
import { reliabilityRankingResponseSchema, inspectorReliabilityResponseSchema } from '@properfy/shared';
import { rankingFixture, anaDetailFixture, carlaDetailFixture } from './reliability';

// The contract is already merged (F07-2); if a fixture fails to parse, the
// fixture is wrong, not the schema (memory feedback_test_fixtures_must_match_api_shape).
describe('reliability fixtures match the shared contract', () => {
  it('ranking fixture parses', () => {
    expect(() => reliabilityRankingResponseSchema.parse(rankingFixture)).not.toThrow();
  });

  it("Ana's detail fixture parses with eight weighted metrics", () => {
    const parsed = inspectorReliabilityResponseSchema.parse(anaDetailFixture);
    expect(parsed.metrics).toHaveLength(8);
    expect(parsed.metrics.every((m) => typeof m.weight === 'number')).toBe(true);
  });

  it("Carla's below-volume fixture parses", () => {
    expect(() => inspectorReliabilityResponseSchema.parse(carlaDetailFixture)).not.toThrow();
  });
});
