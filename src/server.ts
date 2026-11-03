import { serve } from '@hono/node-server';
import { app } from './app.ts';
import { migrate } from './db.ts';
import { startReminderLoop } from './reminders.ts';

await migrate();
const port = Number(process.env.PORT || 8811);
const hostname = process.env.HOST || '127.0.0.1';
serve({ fetch: app.fetch, port, hostname }, () => console.log(`mums.flower on http://${hostname}:${port}`));
if (process.env.MUMS_REMINDERS !== 'off') startReminderLoop();
