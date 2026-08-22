// src/lib/db.ts
// Unified database client interface supporting Cloudflare D1 and local SQLite fallback

import type { D1Database } from '@cloudflare/workers-types';
import { SCHEMA_SQL, SEED_SQL } from './schema_sql.ts';

let localDbInstance: any = null;
let d1Initialized = false;

function splitSqlStatements(sqlText: string): string[] {
  return sqlText
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

async function ensureD1Initialized(d1: D1Database): Promise<void> {
  if (d1Initialized) return;
  try {
    const test = await d1.prepare('SELECT count(*) as count FROM sqlite_master WHERE type="table" AND name="content_items"').first<{ count: number }>();
    if (!test || test.count === 0) {
      console.log('[D1 Init] Initializing tables and seed data in Cloudflare D1...');
      
      const statements = [...splitSqlStatements(SCHEMA_SQL), ...splitSqlStatements(SEED_SQL)];
      for (const stmt of statements) {
        try {
          await d1.prepare(stmt).run();
        } catch (err: any) {
          // Ignore if table/index already exists
          if (!err?.message?.includes('already exists')) {
            console.warn('[D1 Statement Init Error]', err?.message);
          }
        }
      }
      console.log('[D1 Init] Tables and initial data successfully loaded.');
    }
    d1Initialized = true;
  } catch (err) {
    console.warn('[D1 Init Warning]', err);
  }
}

function getLocalDatabase(): any {
  if (localDbInstance) return localDbInstance;
  
  try {
    const Database = require('better-sqlite3');
    const { existsSync, mkdirSync } = require('node:fs');
    const { join } = require('node:path');

    const dataDir = join(process.cwd(), '.wrangler', 'local-d1');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = join(dataDir, 'local.sqlite');
    localDbInstance = new Database(dbPath);
    localDbInstance.pragma('journal_mode = WAL');
    localDbInstance.pragma('foreign_keys = ON');

    // Initialize schema and seed data
    localDbInstance.exec(SCHEMA_SQL);
    localDbInstance.exec(SEED_SQL);

    return localDbInstance;
  } catch (err) {
    console.warn('Local SQLite fallback initialization note:', err);
    return null;
  }
}

export interface DbClient {
  query<T = any>(sql: string, params?: any[]): Promise<{ results: T[]; success: boolean }>;
  first<T = any>(sql: string, params?: any[]): Promise<T | null>;
  run(sql: string, params?: any[]): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
  exec(sql: string): Promise<void>;
  batch(statements: { sql: string; params?: any[] }[]): Promise<any[]>;
}

export function getDb(d1?: D1Database | null): DbClient {
  // If native Cloudflare D1 binding is provided in runtime
  if (d1 && typeof d1.prepare === 'function') {
    return {
      async query<T = any>(sql: string, params: any[] = []) {
        try {
          const stmt = d1.prepare(sql).bind(...params);
          const res = await stmt.all<T>();
          return { results: (res.results || []) as T[], success: res.success };
        } catch (err: any) {
          if (err?.message?.includes('no such table') || err?.message?.includes('SQLITE_ERROR')) {
            await ensureD1Initialized(d1);
            const stmt = d1.prepare(sql).bind(...params);
            const res = await stmt.all<T>();
            return { results: (res.results || []) as T[], success: res.success };
          }
          throw err;
        }
      },
      async first<T = any>(sql: string, params: any[] = []) {
        try {
          const stmt = d1.prepare(sql).bind(...params);
          return await stmt.first<T>();
        } catch (err: any) {
          if (err?.message?.includes('no such table') || err?.message?.includes('SQLITE_ERROR')) {
            await ensureD1Initialized(d1);
            const stmt = d1.prepare(sql).bind(...params);
            return await stmt.first<T>();
          }
          throw err;
        }
      },
      async run(sql: string, params: any[] = []) {
        try {
          const stmt = d1.prepare(sql).bind(...params);
          const res = await stmt.run();
          return {
            success: res.success,
            meta: {
              changes: res.meta?.changes ?? 0,
              last_row_id: res.meta?.last_row_id ?? 0,
            }
          };
        } catch (err: any) {
          if (err?.message?.includes('no such table') || err?.message?.includes('SQLITE_ERROR')) {
            await ensureD1Initialized(d1);
            const stmt = d1.prepare(sql).bind(...params);
            const res = await stmt.run();
            return {
              success: res.success,
              meta: {
                changes: res.meta?.changes ?? 0,
                last_row_id: res.meta?.last_row_id ?? 0,
              }
            };
          }
          throw err;
        }
      },
      async exec(sql: string) {
        await d1.exec(sql);
      },
      async batch(statements: { sql: string; params?: any[] }[]) {
        const prepared = statements.map(s => d1.prepare(s.sql).bind(...(s.params || [])));
        return await d1.batch(prepared);
      }
    };
  }

  // Fallback to local SQLite for development / SSR
  const localDb = getLocalDatabase();
  if (!localDb) {
    return {
      async query() { return { results: [], success: true }; },
      async first() { return null; },
      async run() { return { success: true, meta: { changes: 0, last_row_id: 0 } }; },
      async exec() {},
      async batch() { return []; }
    };
  }

  return {
    async query<T = any>(sql: string, params: any[] = []) {
      try {
        const stmt = localDb.prepare(sql);
        const results = stmt.all(...params) as T[];
        return { results, success: true };
      } catch (err: any) {
        console.error('Local DB query error:', err);
        return { results: [], success: false };
      }
    },
    async first<T = any>(sql: string, params: any[] = []) {
      try {
        const stmt = localDb.prepare(sql);
        const res = stmt.get(...params) as T | undefined;
        return res || null;
      } catch (err: any) {
        console.error('Local DB first error:', err);
        return null;
      }
    },
    async run(sql: string, params: any[] = []) {
      try {
        const stmt = localDb.prepare(sql);
        const info = stmt.run(...params);
        return {
          success: true,
          meta: {
            changes: info.changes,
            last_row_id: Number(info.lastInsertRowid),
          }
        };
      } catch (err: any) {
        console.error('Local DB run error:', err);
        return {
          success: false,
          meta: { changes: 0, last_row_id: 0 }
        };
      }
    },
    async exec(sql: string) {
      localDb.exec(sql);
    },
    async batch(statements: { sql: string; params?: any[] }[]) {
      const transaction = localDb.transaction((stmts: any[]) => {
        return stmts.map((s: any) => {
          const stmt = localDb.prepare(s.sql);
          return stmt.run(...(s.params || []));
        });
      });
      return transaction(statements);
    }
  };
}
