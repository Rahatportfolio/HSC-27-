import { describe, expect, it } from 'vitest';
import { calculateGpa, gradeFor } from './gpa';

const excellent = { physics: 160, chemistry: 160, biology: 160, bangla: 160, english: 160, ict: 80, math: 160 };
describe('HSC GPA and Golden A+ helper', () => {
  it('awards 5.00 and Golden A+ when every subject is at least 80%', () => {
    const result = calculateGpa(excellent);
    expect(result.gpa).toBe(5);
    expect(result.golden).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.failed).toBe(false);
  });
  it('applies the fourth-subject bonus above grade point 2', () => {
    const result = calculateGpa({ physics: 140, chemistry: 140, biology: 140, bangla: 140, english: 140, ict: 70, math: 160 });
    // Six compulsory A grades: 6 × 4 = 24; optional A+ adds 5 − 2 = 3; 27 / 6 = 4.5.
    expect(result.gpa).toBe(4.5);
    expect(result.bonus).toBe(3);
    expect(result.golden).toBe(false);
  });
  it('never subtracts marks for a weak fourth subject', () => {
    // Math 90/200 = 45% → C (2 points), so the bonus is 0 rather than a negative number.
    const result = calculateGpa({ physics: 140, chemistry: 140, biology: 140, bangla: 140, english: 140, ict: 70, math: 90 });
    expect(result.bonus).toBe(0);
    expect(result.gpa).toBe(4);
    expect(result.failed).toBe(false);
  });
  it('returns no GPA until all six compulsory subjects have marks', () => {
    expect(calculateGpa({ physics: 140 }).gpa).toBeNull();
    expect(calculateGpa({ physics: 140 }).complete).toBe(false);
  });
  it('makes the GPA 0.00 when a compulsory subject is failed', () => {
    const result = calculateGpa({ ...excellent, biology: 60 });
    expect(result.failed).toBe(true);
    expect(result.gpa).toBe(0);
    expect(result.golden).toBe(false);
  });
  it('does not fail the result for an optional F and gives no bonus', () => {
    const result = calculateGpa({ ...excellent, math: 0 });
    expect(result.failed).toBe(false);
    expect(result.bonus).toBe(0);
    expect(result.gpa).toBe(5);
    expect(result.golden).toBe(false);
    expect(calculateGpa({ ...excellent, biology: 0, math: 0 }).failed).toBe(true);
    expect(calculateGpa({ math: 0 }).gpa).toBeNull();
  });
  it('uses the standard HSC percentage grade boundaries', () => {
    expect(gradeFor(80).grade).toBe('A+');
    expect(gradeFor(79.99).grade).toBe('A');
    expect(gradeFor(70).point).toBe(4);
    expect(gradeFor(60).grade).toBe('A-');
    expect(gradeFor(50).grade).toBe('B');
    expect(gradeFor(40).grade).toBe('C');
    expect(gradeFor(33).grade).toBe('D');
    expect(gradeFor(32.99).grade).toBe('F');
    expect(gradeFor(100).point).toBe(5);
  });
});
