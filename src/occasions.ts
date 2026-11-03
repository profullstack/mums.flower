/**
 * The dates moms get flowers on. All dates are calendar dates (YYYY-MM-DD),
 * computed in UTC so a server's timezone never moves them.
 */
export type Country = 'US' | 'UK';

export interface Occasion {
  kind: 'birthday' | 'mothers-day';
  label: string;
  date: string; // YYYY-MM-DD
  daysAway: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** Easter Sunday (Gregorian), anonymous algorithm (Meeus/Jones/Butcher). */
export function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

/** US (and most of the world): the second Sunday of May. UK: Mothering Sunday, three weeks before Easter. */
export function mothersDay(year: number, country: Country = 'US'): string {
  if (country === 'UK') {
    const e = easter(year);
    return iso(new Date(e.getTime() - 21 * 86_400_000));
  }
  const may1 = utc(year, 5, 1);
  const firstSunday = 1 + ((7 - may1.getUTCDay()) % 7);
  return iso(utc(year, 5, firstSunday + 7));
}

/** "MM-DD" (or "YYYY-MM-DD") to a validated "MM-DD", else null. */
export function cleanBirthday(input: unknown): string | null {
  const s = String(input ?? '').trim();
  const m = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  if (mm < 1 || mm > 12 || dd < 1) return null;
  const max = new Date(Date.UTC(2024, mm, 0)).getUTCDate(); // leap year allows 02-29
  return dd <= max ? `${m[1]}-${m[2]}` : null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** The next occurrence (today counts) of a birthday "MM-DD". Feb 29 falls on Feb 28 in other years. */
export function nextBirthday(mmdd: string, today: string): string {
  const y = Number(today.slice(0, 4));
  for (const year of [y, y + 1]) {
    let [mm, dd] = mmdd.split('-').map(Number);
    const isLeap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
    if (mm === 2 && dd === 29 && !isLeap) dd = 28;
    const d = iso(utc(year, mm, dd));
    if (d >= today) return d;
  }
  throw new Error('unreachable');
}

export function nextMothersDay(country: Country, today: string): string {
  const y = Number(today.slice(0, 4));
  const thisYear = mothersDay(y, country);
  return thisYear >= today ? thisYear : mothersDay(y + 1, country);
}

/** Upcoming occasions for one mom, soonest first. */
export function occasionsFor(mom: { name: string; birthday: string | null; country: string }, today: string): Occasion[] {
  const country: Country = mom.country === 'UK' ? 'UK' : 'US';
  const list: Occasion[] = [];
  const md = nextMothersDay(country, today);
  list.push({ kind: 'mothers-day', label: country === 'UK' ? 'Mothering Sunday' : "Mother's Day", date: md, daysAway: daysBetween(today, md) });
  if (mom.birthday) {
    const b = nextBirthday(mom.birthday, today);
    list.push({ kind: 'birthday', label: `${mom.name}'s birthday`, date: b, daysAway: daysBetween(today, b) });
  }
  return list.sort((a, b) => a.daysAway - b.daysAway);
}

export const todayUtc = () => new Date().toISOString().slice(0, 10);
