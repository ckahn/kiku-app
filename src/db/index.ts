import { neon } from '@neondatabase/serverless';
import type { Logger } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const databaseUrl = process.env.KIKU_APP_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('KIKU_APP_DATABASE_URL is not configured');
}

class DevDbLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    console.info('[db] query:', query);
    console.info('[db] params:', params);
  }
}

const sql = neon(databaseUrl);
export const db = drizzle(sql, {
  schema,
  logger: process.env.NODE_ENV === 'development' ? new DevDbLogger() : false,
});
