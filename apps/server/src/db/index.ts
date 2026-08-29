import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { config } from '../config.js';
import { bootstrapSchema } from './bootstrap.js';
import * as schema from './schema.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const sqlite = new BetterSqlite3(config.databasePath);
bootstrapSchema(sqlite);

export const db = drizzle(sqlite, { schema });
export { schema };

export function closeDatabase(): void {
  sqlite.close();
}
