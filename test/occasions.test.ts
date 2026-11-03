import { describe, expect, it } from 'vitest';
import { cleanBirthday, easter, mothersDay, nextBirthday, nextMothersDay, occasionsFor } from '../src/occasions.ts';

describe('dates', () => {
  it('computes Easter (known dates)', () => {
    expect(easter(2024).toISOString().slice(0, 10)).toBe('2024-03-31');
    expect(easter(2025).toISOString().slice(0, 10)).toBe('2025-04-20');
    expect(easter(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(easter(2027).toISOString().slice(0, 10)).toBe('2027-03-28');
  });

  it("US Mother's Day is the second Sunday of May", () => {
    expect(mothersDay(2024, 'US')).toBe('2024-05-12');
    expect(mothersDay(2025, 'US')).toBe('2025-05-11');
    expect(mothersDay(2026, 'US')).toBe('2026-05-10');
    expect(mothersDay(2027, 'US')).toBe('2027-05-09');
    expect(mothersDay(2022, 'US')).toBe('2022-05-08'); // May 1 2022 was a Sunday
  });

  it('UK Mothering Sunday is three weeks before Easter', () => {
    expect(mothersDay(2024, 'UK')).toBe('2024-03-10');
    expect(mothersDay(2025, 'UK')).toBe('2025-03-30');
    expect(mothersDay(2026, 'UK')).toBe('2026-03-15');
    expect(mothersDay(2027, 'UK')).toBe('2027-03-07');
  });

  it('next occurrences roll over the year; today counts', () => {
    expect(nextMothersDay('US', '2026-11-03')).toBe('2027-05-09');
    expect(nextMothersDay('US', '2026-05-10')).toBe('2026-05-10');
    expect(nextBirthday('05-14', '2026-11-03')).toBe('2027-05-14');
    expect(nextBirthday('12-25', '2026-11-03')).toBe('2026-12-25');
    expect(nextBirthday('02-29', '2026-11-03')).toBe('2027-02-28');
    expect(nextBirthday('02-29', '2027-03-01')).toBe('2028-02-29');
  });

  it('validates birthdays', () => {
    expect(cleanBirthday('05-14')).toBe('05-14');
    expect(cleanBirthday('1955-05-14')).toBe('05-14');
    expect(cleanBirthday('02-29')).toBe('02-29');
    expect(cleanBirthday('02-30')).toBeNull();
    expect(cleanBirthday('13-01')).toBeNull();
    expect(cleanBirthday('May 14')).toBeNull();
  });

  it('lists a mom\'s occasions soonest first', () => {
    const o = occasionsFor({ name: 'Mom', birthday: '12-25', country: 'UK' }, '2026-11-03');
    expect(o.map((x) => [x.kind, x.date, x.daysAway])).toEqual([
      ['birthday', '2026-12-25', 52],
      ['mothers-day', '2027-03-07', 124],
    ]);
  });
});
