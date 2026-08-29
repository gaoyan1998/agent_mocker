import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';
import { bootstrapSchema } from './bootstrap.js';
import { drizzle } from './node-sqlite.js';
import * as schema from './schema.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const sqlite = new DatabaseSync(config.databasePath);
bootstrapSchema(sqlite);

export const db = drizzle(sqlite);
export { schema };

export function closeDatabase(): void {
  sqlite.close();
}
