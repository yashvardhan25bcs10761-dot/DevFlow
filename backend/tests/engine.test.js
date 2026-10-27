import { describe, it, expect } from 'vitest';
import {
  detectStaleItem,
  calculateHealthScore,
  generateRecommendations,
  analyzeRepository,
} from '../services/analysisEngine.js';

describe('Analysis Engine Pure Functions (SPEC Section 9 & 12)', () => {
  const FIXED_NOW = new Date('2026-10-27T12:00:00.000Z');
  const MS_PER_DAY = 86_400_000;

  describe('Stale Detection (SPEC Section 9)', () => {
    it('boundary condition: exactly equal to threshold is stale', () => {
      // 14 days ago exactly to the millisecond
      const exact14DaysAgo = new Date(FIXED_NOW.getTime() - 14 * MS_PER_DAY).toISOString();
      const issue = { state: 'open', updatedAt: exact14DaysAgo };

      const result = detectStaleItem(issue, 14, FIXED_NOW);
      expect(result.isStale).toBe(true);
      expect(result.inactivityDays).toBe(14);
    });

    it('inactivity strictly less than threshold is not stale', () => {
      // 13.9 days ago (floor is 13)
      const recent = new Date(FIXED_NOW.getTime() - 13.5 * MS_PER_DAY).toISOString();
      const issue = { state: 'open', updatedAt: recent };

      const result = detectStaleItem(issue, 14, FIXED_NOW);
      expect(result.isStale).toBe(false);
      expect(result.inactivityDays).toBe(13);
    });

    it('closed issues/PRs are NEVER stale regardless of inactivity age', () => {
      // Inactive for 500 days, but closed
      const oldClosedDate = new Date(FIXED_NOW.getTime() - 500 * MS_PER_DAY).toISOString();
      const issue = { state: 'closed', updatedAt: oldClosedDate };

      const result = detectStaleItem(issue, 14, FIXED_NOW);
      expect(result.isStale).toBe(false);
    });

    it('handles invalid or missing timestamps safely without crashing', () => {
      const issueInvalid = { state: 'open', updatedAt: 'invalid-date' };
      const issueNull = { state: 'open', updatedAt: null };

      const res1 = detectStaleItem(issueInvalid, 14, FIXED_NOW);
      expect(res1.isStale).toBe(false);
      expect(res1.warning).toBeDefined();

      const res2 = detectStaleItem(issueNull, 14, FIXED_NOW);
      expect(res2.isStale).toBe(false);
      expect(res2.warning).toBeDefined();
    });

    it('draft PRs are not stale just for being draft, but follow threshold when inactive', () => {
      const activeDraft = {
        state: 'open',
        isDraft: true,
        updatedAt: new Date(FIXED_NOW.getTime() - 2 * MS_PER_DAY).toISOString(),
      };
      const staleDraft = {
        state: 'open',
        isDraft: true,
        updatedAt: new Date(FIXED_NOW.getTime() - 10 * MS_PER_DAY).toISOString(),
      };

      expect(detectStaleItem(activeDraft, 7, FIXED_NOW).isStale).toBe(false);
      expect(detectStaleItem(staleDraft, 7, FIXED_NOW).isStale).toBe(true);
    });
  });

  describe('Health Score & Component Scoring (SPEC Section 9)', () => {
    it('computes commit activity (weight 0.30): saturation at 20 commits = 100, 0 commits = 0', () => {
      // 20 commits in 30 days -> 100
      const score20 = calculateHealthScore({
        commits30d: 20,
        observedOpenIssues: 0,
        staleOpenIssues: 0,
        observedOpenPRs: 0,
        staleOpenPRs: 0,
        created30d: 0,
        closed30d: 0,
      });
      expect(score20.breakdown.commits.score).toBe(100);

      // 10 commits -> 50
      const score10 = calculateHealthScore({
        commits30d: 10,
        observedOpenIssues: 0,
        staleOpenIssues: 0,
        observedOpenPRs: 0,
        staleOpenPRs: 0,
        created30d: 0,
        closed30d: 0,
      });
      expect(score10.breakdown.commits.score).toBe(50);

      // 0 commits -> 0
      const score0 = calculateHealthScore({
        commits30d: 0,
        observedOpenIssues: 0,
        staleOpenIssues: 0,
        observedOpenPRs: 0,
        staleOpenPRs: 0,
        created30d: 0,
        closed30d: 0,
      });
      expect(score0.breakdown.commits.score).toBe(0);
      expect(score0.breakdown.commits.explanation).toContain('no commits observed in 30 days');
    });

    it('computes issue management score (weight 0.25): null if 0 open issues', () => {
      // 3 of 12 open are stale -> 100 * (1 - 3/12) = 75
      const res = calculateHealthScore({
        commits30d: 20,
        observedOpenIssues: 12,
        staleOpenIssues: 3,
        observedOpenPRs: 0,
        staleOpenPRs: 0,
        created30d: 0,
        closed30d: 0,
      });
      expect(res.breakdown.issues.score).toBe(75);
      expect(res.breakdown.issues.explanation).toContain('3 of 12 observed open issues are stale');

      // 0 open issues -> null
      const resZero = calculateHealthScore({
        commits30d: 20,
        observedOpenIssues: 0,
        staleOpenIssues: 0,
        observedOpenPRs: 0,
        staleOpenPRs: 0,
        created30d: 0,
        closed30d: 0,
      });
      expect(resZero.breakdown.issues.score).toBeNull();
      expect(resZero.breakdown.issues.available).toBe(false);
    });

    it('computes PR management score (weight 0.25): null if 0 open PRs', () => {
      // 1 of 4 open are stale -> 100 * (1 - 1/4) = 75
      const res = calculateHealthScore({
        commits30d: 20,
        observedOpenIssues: 0,
        staleOpenIssues: 0,
        observedOpenPRs: 4,
        staleOpenPRs: 1,
        created30d: 0,
        closed30d: 0,
      });
      expect(res.breakdown.pullRequests.score).toBe(75);

      // 0 open PRs -> null
      const resZero = calculateHealthScore({
        commits30d: 20,
        observedOpenIssues: 0,
        staleOpenIssues: 0,
        observedOpenPRs: 0,
        staleOpenPRs: 0,
        created30d: 0,
        closed30d: 0,
      });
      expect(resZero.breakdown.pullRequests.score).toBeNull();
      expect(resZero.breakdown.pullRequests.available).toBe(false);
    });

    it('computes resolution activity (weight 0.20): created vs closed', () => {
      // 10 created, 8 closed -> 80
      const res80 = calculateHealthScore({
        commits30d: 20,
        observedOpenIssues: 10,
        staleOpenIssues: 0,
        observedOpenPRs: 10,
        staleOpenPRs: 0,
        created30d: 10,
        closed30d: 8,
      });
      expect(res80.breakdown.resolution.score).toBe(80);

      // 0 created, 5 closed -> 100
      const res100 = calculateHealthScore({
        commits30d: 20,
        observedOpenIssues: 10,
        staleOpenIssues: 0,
        observedOpenPRs: 10,
        staleOpenPRs: 0,
        created30d: 0,
        closed30d: 5,
      });
      expect(res100.breakdown.resolution.score).toBe(100);

      // 0 created, 0 closed -> null
      const resNull = calculateHealthScore({
        commits30d: 20,
        observedOpenIssues: 10,
        staleOpenIssues: 0,
        observedOpenPRs: 10,
        staleOpenPRs: 0,
        created30d: 0,
        closed30d: 0,
      });
      expect(resNull.breakdown.resolution.score).toBeNull();
    });

    it('enforces overall score and missing-data policy (complete vs partial vs insufficient_data)', () => {
      // Case 1: All 4 components available -> complete
      // scores: 100 (w 0.30), 80 (w 0.25), 80 (w 0.25), 100 (w 0.20)
      // weighted: 30 + 20 + 20 + 20 = 90
      const completeRes = calculateHealthScore({
        commits30d: 20,
        observedOpenIssues: 10,
        staleOpenIssues: 2, // 80
        observedOpenPRs: 10,
        staleOpenPRs: 2, // 80
        created30d: 5,
        closed30d: 5, // 100
      });
      expect(completeRes.scoreStatus).toBe('complete');
      expect(completeRes.healthScore).toBe(90);

      // Case 2: Available weight >= 0.55 but not all -> partial
      // Commits (0.30) + Issues (0.25) available = 0.55
      // PRs (0.25) and Resolution (0.20) are null
      const partialRes = calculateHealthScore({
        commits30d: 20, // 100
        observedOpenIssues: 10,
        staleOpenIssues: 0, // 100
        observedOpenPRs: 0, // null
        staleOpenPRs: 0,
        created30d: 0, // null
        closed30d: 0,
      });
      expect(partialRes.scoreStatus).toBe('partial');
      expect(partialRes.availableWeight).toBeCloseTo(0.55, 2);
      expect(partialRes.healthScore).toBe(100);

      // Case 3: Available weight < 0.55 -> insufficient_data, healthScore = null
      // Only Resolution (0.20) and Issues (0.25) = 0.45 (< 0.55)
      const insuffRes = calculateHealthScore({
        commits30d: null, // commit fetch failed -> null
        observedOpenIssues: 10,
        staleOpenIssues: 2, // 0.25 weight
        observedOpenPRs: 0, // null
        staleOpenPRs: 0,
        created30d: 5,
        closed30d: 5, // 0.20 weight
      });
      expect(insuffRes.scoreStatus).toBe('insufficient_data');
      expect(insuffRes.healthScore).toBeNull();
    });

    it('never divides by zero on completely empty inputs', () => {
      const emptyRes = calculateHealthScore({
        commits30d: null,
        observedOpenIssues: 0,
        staleOpenIssues: 0,
        observedOpenPRs: 0,
        staleOpenPRs: 0,
        created30d: 0,
        closed30d: 0,
      });
      expect(emptyRes.healthScore).toBeNull();
      expect(emptyRes.scoreStatus).toBe('insufficient_data');
    });
  });

  describe('Recommendation Rules R1–R5 (SPEC Section 9)', () => {
    it('R1 (stale-issues): triggers on staleOpenIssues >= 1 with severity based on percentage', () => {
      // 5 of 6 stale (83% >= 50%) -> high severity
      const highRecs = generateRecommendations({
        staleOpenIssues: 5,
        observedOpenIssues: 6,
        staleOpenPRs: 0,
        observedOpenPRs: 0,
        commits30d: 10,
        created30d: 0,
        closed30d: 0,
        scoreStatus: 'complete',
        scope: { complete: true },
        dataWarnings: [],
      });
      const r1High = highRecs.find((r) => r.id === 'R1');
      expect(r1High).toBeDefined();
      expect(r1High.severity).toBe('high');
      expect(r1High.evidence).toContain('5 of 6');

      // 1 of 10 stale (10% < 50%) -> medium severity
      const medRecs = generateRecommendations({
        staleOpenIssues: 1,
        observedOpenIssues: 10,
        staleOpenPRs: 0,
        observedOpenPRs: 0,
        commits30d: 10,
        created30d: 0,
        closed30d: 0,
        scoreStatus: 'complete',
        scope: { complete: true },
        dataWarnings: [],
      });
      const r1Med = medRecs.find((r) => r.id === 'R1');
      expect(r1Med.severity).toBe('medium');
    });

    it('R2 (stale-prs): triggers on staleOpenPRs >= 1', () => {
      const recs = generateRecommendations({
        staleOpenIssues: 0,
        observedOpenIssues: 0,
        staleOpenPRs: 2,
        observedOpenPRs: 3, // 66% -> high
        commits30d: 10,
        created30d: 0,
        closed30d: 0,
        scoreStatus: 'complete',
        scope: { complete: true },
        dataWarnings: [],
      });
      const r2 = recs.find((r) => r.id === 'R2');
      expect(r2).toBeDefined();
      expect(r2.severity).toBe('high');
    });

    it('R3 (no-recent-commits): triggers when commits30d === 0 and available', () => {
      const recs = generateRecommendations({
        staleOpenIssues: 0,
        observedOpenIssues: 0,
        staleOpenPRs: 0,
        observedOpenPRs: 0,
        commits30d: 0,
        created30d: 0,
        closed30d: 0,
        scoreStatus: 'complete',
        scope: { complete: true },
        dataWarnings: [],
      });
      const r3 = recs.find((r) => r.id === 'R3');
      expect(r3).toBeDefined();
      expect(r3.severity).toBe('medium');
      expect(r3.title).toContain('No commit activity');
    });

    it('R4 (backlog-growth): triggers when closed30d + 1 < created30d / 2 AND openIssues >= 5', () => {
      // created30d: 10, closed30d: 2 -> closed30d + 1 = 3 < (10 / 2 = 5) -> triggers
      const recs = generateRecommendations({
        staleOpenIssues: 0,
        observedOpenIssues: 8,
        staleOpenPRs: 0,
        observedOpenPRs: 0,
        commits30d: 10,
        created30d: 10,
        closed30d: 2,
        scoreStatus: 'complete',
        scope: { complete: true },
        dataWarnings: [],
      });
      const r4 = recs.find((r) => r.id === 'R4');
      expect(r4).toBeDefined();
      expect(r4.severity).toBe('medium');
      expect(r4.evidence).toContain('Created 10');
    });

    it('R5 (partial-data): triggers on partial/insufficient score or incomplete scope or dataWarnings', () => {
      const recs = generateRecommendations({
        staleOpenIssues: 0,
        observedOpenIssues: 0,
        staleOpenPRs: 0,
        observedOpenPRs: 0,
        commits30d: 10,
        created30d: 0,
        closed30d: 0,
        scoreStatus: 'partial',
        scope: { complete: false },
        dataWarnings: ['Issues capped at 300 items'],
      });
      const r5 = recs.find((r) => r.id === 'R5');
      expect(r5).toBeDefined();
      expect(r5.severity).toBe('info');
    });

    it('sorts recommendations by severity (high -> medium -> low -> info), no duplicate rules', () => {
      const recs = generateRecommendations({
        staleOpenIssues: 8,
        observedOpenIssues: 10, // R1 (high)
        staleOpenPRs: 1,
        observedOpenPRs: 4, // R2 (medium)
        commits30d: 0, // R3 (medium)
        created30d: 10,
        closed30d: 1, // R4 (medium)
        scoreStatus: 'partial', // R5 (info)
        scope: { complete: false },
        dataWarnings: [],
      });

      expect(recs.map((r) => r.id)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5']);
      expect(recs[0].severity).toBe('high');
      expect(recs[recs.length - 1].severity).toBe('info');
    });
  });

  describe('analyzeRepository Orchestrator', () => {
    it('is pure, deterministic with injected now, and caps stale lists to 50 and recs to 20', () => {
      const repo = {
        fullName: 'test/repo',
        stars: 100,
        forks: 20,
      };

      // 60 stale issues
      const issues = Array.from({ length: 60 }, (_, i) => ({
        id: i,
        number: i + 1,
        title: `Stale issue ${i + 1}`,
        state: 'open',
        updatedAt: '2025-01-01T00:00:00Z',
        createdAt: '2025-01-01T00:00:00Z',
      }));

      const result = analyzeRepository({
        repo,
        commits: [{ sha: '123', date: '2026-10-20T00:00:00Z' }],
        issues,
        pulls: [],
        thresholds: { staleIssueDays: 14, stalePullRequestDays: 7 },
        now: FIXED_NOW,
      });

      expect(result.analyzedAt).toBe(FIXED_NOW.toISOString());
      expect(result.staleIssues.length).toBeLessThanOrEqual(50);
      expect(result.recommendations.length).toBeLessThanOrEqual(20);
      expect(result.issueSummary.staleOpenIssues).toBe(60);
      expect(result.thresholdsUsed.issueDays).toBe(14);
    });
  });
});
