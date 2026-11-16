import { describe, expect, it } from 'vitest';
import { auditHeadline, bnNum, selfAudit } from './selfAudit';
import { CHAPTERS } from './data';
import { STARTER_QUESTIONS } from './quiz-data';
import { freshData } from './planner';

const report = selfAudit();

describe('the audit re-counts instead of trusting the interface', () => {
  it('counts the chapters and the bank from the source', () => {
    expect(report.counts.chapters).toBe(CHAPTERS.length);
    expect(report.counts.bankQuestions).toBe(STARTER_QUESTIONS.length);
    expect(report.counts.subjects).toBeGreaterThan(0);
  });

  it('runs both generators and finds no verification issue', () => {
    expect(report.counts.factQuestions).toBeGreaterThan(100);
    expect(report.counts.numericSchemas).toBeGreaterThan(40);
    expect(report.counts.verifyIssues).toBe(0);
    expect(report.counts.duplicates).toBe(0);
  });

  it('reports a failing check as a failure, not as a pass', () => {
    const counts = report.checks.map(check => check.status);
    expect(counts).not.toContain('fail');
    expect(report.checks.every(check => check.value.length > 0)).toBe(true);
  });

  it('names the thin chapters honestly instead of hiding them', () => {
    expect(report.thin.length).toBeGreaterThan(0);
    expect(report.thin.every(entry => entry.pool < 10)).toBe(true);
    // Sorted worst first, so the page can point at what to fix next.
    for (let index = 1; index < report.thin.length; index += 1) {
      expect(report.thin[index - 1].pool).toBeLessThanOrEqual(report.thin[index].pool);
    }
  });

  it('says what the app cannot do instead of implying it can', () => {
    expect(report.limits.length).toBeGreaterThanOrEqual(3);
    expect(report.limits.map(limit => limit.en).join(' ')).toMatch(/no server|server/i);
  });

  it('checks the 8-hour ceiling on every backlog day it looked at', () => {
    const plan = report.checks.find(check => check.key === 'plan');
    expect(plan?.status).toBe('ok');
  });
});

describe('the headline never flatters a partial result', () => {
  it('reports the weakest check', () => {
    const broken = {
      ...report,
      checks: [{ ...report.checks[0], status: 'fail' as const }, ...report.checks.slice(1)],
    };
    const headline = auditHeadline(broken);
    expect(headline.status).toBe('fail');
    expect(headline.bn).toContain('ব্যর্থ');
  });

  it('turns a warning into a warning, not a pass', () => {
    const warned = {
      ...report,
      checks: report.checks.map((check, index) => index === 0 ? { ...check, status: 'warn' as const } : check),
    };
    expect(auditHeadline(warned).status).toBe('warn');
  });

  it('says all clear only when every check is ok', () => {
    const clean = { ...report, checks: report.checks.map(check => ({ ...check, status: 'ok' as const })) };
    expect(auditHeadline(clean).status).toBe('ok');
  });
});

describe('it works on a profile with no history', () => {
  it('still reports the syllabus and bank for a brand-new student', () => {
    const fresh = selfAudit(freshData());
    expect(fresh.counts.bankQuestions).toBe(STARTER_QUESTIONS.length);
    expect(fresh.checks.find(check => check.key === 'focus')?.status).toBe('ok');
  });

  it('renders Bengali digits for prose numbers', () => {
    expect(bnNum(114)).toBe('১১৪');
    expect(bnNum('0 issues')).toBe('০ issues');
  });
});
