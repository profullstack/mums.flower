import { all, run } from './db.ts';
import { sendReminder } from './mail.ts';
import { todayUtc } from './occasions.ts';
import { publicBase, upcoming, type Upcoming } from './service.ts';

/**
 * Email each user about their moms' occasions 14 and 2 days ahead (and on the
 * day, if the server missed both). Each (mom, occasion, lead) is sent once:
 * reminders_sent is written before the email goes out would lose a reminder on
 * a failed send, so it is written after a successful one.
 */
export const LEADS = [14, 2];

export async function runReminders(today = todayUtc()): Promise<{ users: number; emails: number }> {
  const users = await all<{ id: string; email: string }>('select distinct u.id, u.email from users u join moms m on m.user_id = u.id');
  let emails = 0;
  for (const u of users) {
    const due: Array<Upcoming & { key: string; year: number }> = [];
    for (const o of await upcoming(u.id, today, 15)) {
      const lead = LEADS.find((d) => o.daysAway === d);
      if (lead === undefined) continue;
      const key = `${o.kind}:${lead}`;
      const year = Number(o.date.slice(0, 4));
      const done = await all('select 1 from reminders_sent where mom_id = ? and occasion = ? and year = ?', [o.momId, key, year]);
      if (!done.length) due.push({ ...o, key, year });
    }
    if (!due.length) continue;
    const r = await sendReminder(u.email, due, publicBase());
    if (!r.sent) {
      console.error(`[reminders] not sent to user ${u.id}: ${r.error}`);
      continue;
    }
    emails += 1;
    for (const d of due) {
      await run('insert or ignore into reminders_sent (mom_id, occasion, year, sent_at) values (?,?,?,?)', [d.momId, d.key, d.year, Date.now()]);
    }
  }
  return { users: users.length, emails };
}

export function startReminderLoop(): void {
  const tick = () =>
    runReminders()
      .then((r) => r.emails && console.log(`[reminders] sent ${r.emails} email(s)`))
      .catch((e) => console.error('[reminders]', e));
  setTimeout(tick, 30_000);
  setInterval(tick, 3600_000).unref();
}
