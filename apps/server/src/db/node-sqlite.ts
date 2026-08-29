import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { NoopCache, type Cache } from 'drizzle-orm/cache/core';
import type { WithCacheConfig } from 'drizzle-orm/cache/core/types';
import { Column } from 'drizzle-orm/column';
import { entityKind, is } from 'drizzle-orm/entity';
import { DefaultLogger, NoopLogger, type Logger } from 'drizzle-orm/logger';
import type { SelectedFieldsOrdered } from 'drizzle-orm/operations';
import { fillPlaceholders, sql, SQL, type Query } from 'drizzle-orm/sql';
import { Subquery } from 'drizzle-orm/subquery';
import {
  BaseSQLiteDatabase,
  SQLitePreparedQuery,
  SQLiteSession,
  SQLiteSyncDialect,
  SQLiteTransaction,
  type PreparedQueryConfig as PreparedQueryConfigBase,
  type SQLiteExecuteMethod,
  type SQLiteTransactionConfig,
} from 'drizzle-orm/sqlite-core';
import { getTableName } from 'drizzle-orm/table';

/**
 * 基于 Node 24 内置 node:sqlite 的 Drizzle 同步驱动。
 *
 * drizzle-orm/better-sqlite3 驱动会在模块顶层 import 'better-sqlite3'，只要删掉
 * 那个包，无论是否传自定义 client 都会崩，所以这里照着官方 bun-sqlite 驱动的
 * 结构实现同一套 session / prepared query。数据库文件与建表 SQL 都不变。
 *
 * 行模式的说明：drizzle 对每条 PreparedQuery 只用一种行模式 —— 无字段映射时用
 * 对象行（StatementSync 默认），有字段映射时经 values() 路径拿数组行。后者靠
 * setReturnArrays(true) 打开（对应 better-sqlite3 的 raw()），两者不会在同一条
 * 语句上混用。
 */

/** node:sqlite 可绑定的参数类型；布尔 / undefined 必须先转成 null / number / string。 */
type BindValue = null | number | bigint | string | Uint8Array;

export interface NodeSqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export interface NodeSqliteSessionOptions {
  logger?: Logger;
  cache?: Cache;
}

export class NodeSqliteSession extends SQLiteSession<
  'sync',
  NodeSqliteRunResult,
  Record<string, never>,
  Record<string, never>
> {
  static override readonly [entityKind]: string = 'NodeSqliteSession';

  private readonly client: DatabaseSync;
  private readonly dialect: SQLiteSyncDialect;

  constructor(client: DatabaseSync, dialect: SQLiteSyncDialect, options: NodeSqliteSessionOptions = {}) {
    super(dialect);
    this.client = client;
    this.dialect = dialect;
    this.logger = options.logger ?? new NoopLogger();
    this.cache = options.cache ?? new NoopCache();
  }

  private readonly logger: Logger;
  private readonly cache: Cache;

  override prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
    query: Query,
    fields: SelectedFieldsOrdered<Column> | undefined,
    executeMethod: SQLiteExecuteMethod,
    isResponseInArrayMode: boolean,
    customResultMapper?: (rows: unknown[][]) => unknown,
    queryMetadata?: { type: 'select' | 'update' | 'delete' | 'insert'; tables: string[] },
    cacheConfig?: WithCacheConfig,
  ): NodeSqlitePreparedQuery<T> {
    const stmt = this.client.prepare(query.sql);
    return new NodeSqlitePreparedQuery(
      stmt,
      query,
      this.logger,
      this.cache,
      queryMetadata,
      cacheConfig,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper,
    );
  }

  override transaction<T>(
    transaction: (tx: NodeSqliteTransaction) => T,
    config: SQLiteTransactionConfig = {},
  ): T {
    const tx = new NodeSqliteTransaction(this.dialect, this);
    // SQLiteTransactionConfig.behavior: 'deferred' | 'immediate' | 'exclusive'。
    this.client.exec(`BEGIN ${config.behavior?.toUpperCase() || 'DEFERRED'}`);
    try {
      const result = transaction(tx);
      this.client.exec('COMMIT');
      return result;
    } catch (error) {
      this.client.exec('ROLLBACK');
      throw error;
    }
  }
}

export class NodeSqliteTransaction extends SQLiteTransaction<
  'sync',
  NodeSqliteRunResult,
  Record<string, never>,
  Record<string, never>
> {
  static override readonly [entityKind]: string = 'NodeSqliteTransaction';

  private readonly dialect: SQLiteSyncDialect;
  private readonly session: NodeSqliteSession;

  constructor(dialect: SQLiteSyncDialect, session: NodeSqliteSession, nestedIndex?: number) {
    super('sync', dialect, session, undefined, nestedIndex);
    this.dialect = dialect;
    this.session = session;
  }

  override transaction<T>(transaction: (tx: NodeSqliteTransaction) => T): T {
    const savepointName = `sp${this.nestedIndex}`;
    const tx = new NodeSqliteTransaction(this.dialect, this.session, this.nestedIndex + 1);
    this.session.run(sql.raw(`savepoint ${savepointName}`));
    try {
      const result = transaction(tx);
      this.session.run(sql.raw(`release savepoint ${savepointName}`));
      return result;
    } catch (error) {
      this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
      throw error;
    }
  }
}

export class NodeSqlitePreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends SQLitePreparedQuery<{
  type: 'sync';
  run: NodeSqliteRunResult;
  all: T['all'];
  get: T['get'];
  values: T['values'];
  execute: T['execute'];
}> {
  static override readonly [entityKind]: string = 'NodeSqlitePreparedQuery';

  /** 基类构造时写入初值，SQLiteSelectBase 在 prepare 后覆写（见 drizzle sqlite-core）。 */
  declare joinsNotNullableMap: Record<string, boolean> | undefined;

  constructor(
    private readonly stmt: StatementSync,
    query: Query,
    private readonly logger: Logger,
    cache: Cache,
    queryMetadata: { type: 'select' | 'update' | 'delete' | 'insert'; tables: string[] } | undefined,
    cacheConfig: WithCacheConfig | undefined,
    private readonly fields: SelectedFieldsOrdered<Column> | undefined,
    executeMethod: SQLiteExecuteMethod,
    private readonly arrayMode: boolean,
    private readonly customResultMapper?: (rows: unknown[][]) => unknown,
  ) {
    super('sync', executeMethod, query, cache, queryMetadata, cacheConfig);
  }

  run(placeholderValues?: Record<string, unknown>): NodeSqliteRunResult {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {}) as BindValue[];
    this.logger.logQuery(this.query.sql, params);
    const result = this.stmt.run(...params);
    return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
  }

  all(placeholderValues?: Record<string, unknown>): T['all'] {
    const { fields, joinsNotNullableMap, query, logger, stmt, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      const params = fillPlaceholders(query.params, placeholderValues ?? {}) as BindValue[];
      logger.logQuery(query.sql, params);
      return stmt.all(...params) as T['all'];
    }
    const rows = this.values(placeholderValues);
    if (customResultMapper) {
      return customResultMapper(rows as unknown[][]) as T['all'];
    }
    return (rows as unknown[][]).map((row) => mapResultRow(fields!, row, joinsNotNullableMap)) as T['all'];
  }

  get(placeholderValues?: Record<string, unknown>): T['get'] {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {}) as BindValue[];
    this.logger.logQuery(this.query.sql, params);
    const { fields, stmt, joinsNotNullableMap, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      return stmt.get(...params) as T['get'];
    }
    const row = (this.values(placeholderValues) as unknown[][])[0];
    if (!row) {
      return undefined as T['get'];
    }
    if (customResultMapper) {
      return customResultMapper([row]) as T['get'];
    }
    return mapResultRow(fields!, row, joinsNotNullableMap) as T['get'];
  }

  values(placeholderValues?: Record<string, unknown>): T['values'] {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {}) as BindValue[];
    this.logger.logQuery(this.query.sql, params);
    // 数组行模式（对应 better-sqlite3 的 raw()）。node:sqlite 没有独立视图，只能在语句上切换。
    this.stmt.setReturnArrays(true);
    return this.stmt.all(...params) as T['values'];
  }

  /** @internal */
  isResponseInArrayMode(): boolean {
    return this.arrayMode;
  }
}

export type NodeSqliteDatabase = BaseSQLiteDatabase<
  'sync',
  NodeSqliteRunResult,
  Record<string, never>,
  Record<string, never>
>;

interface RowDecoder {
  mapFromDriverValue(value: unknown): unknown;
}

/**
 * drizzle-orm 内部函数 mapResultRow 的移植（上游源码在 drizzle-orm/utils.js，未从
 * 包的公共入口导出；SQLiteSelectBase 会以「有 fields、无 customResultMapper」的形式
 * 走到这条路径）。升级 drizzle-orm 后若 select 结果映射异常，先核对这里与上游实现。
 */
function mapResultRow(
  columns: SelectedFieldsOrdered<Column>,
  row: unknown[],
  joinsNotNullableMap: Record<string, boolean> | undefined,
): Record<string, unknown> {
  const nullifyMap: Record<string, string | false> = {};
  const result = columns.reduce<Record<string, unknown>>(
    (acc, { path, field }, columnIndex) => {
      // SQL 的 decoder 属性没有进 d.ts，按运行时实际结构取。
      let decoder: RowDecoder;
      if (is(field, Column)) {
        decoder = field;
      } else if (is(field, SQL)) {
        decoder = (field as SQL & { decoder: RowDecoder }).decoder;
      } else if (is(field, Subquery)) {
        decoder = (field as unknown as { _: { sql: SQL & { decoder: RowDecoder } } })._.sql.decoder;
      } else {
        decoder = (field as unknown as { sql: SQL & { decoder: RowDecoder } }).sql.decoder;
      }
      let node = acc;
      for (const [pathChunkIndex, pathChunk] of path.entries()) {
        if (pathChunkIndex < path.length - 1) {
          if (!(pathChunk in node)) {
            node[pathChunk] = {};
          }
          node = node[pathChunk] as Record<string, unknown>;
        } else {
          const rawValue = row[columnIndex];
          const value = node[pathChunk] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);
          if (joinsNotNullableMap && is(field, Column) && path.length === 2) {
            const objectName = path[0]!;
            if (!(objectName in nullifyMap)) {
              nullifyMap[objectName] = value === null ? getTableName(field.table) : false;
            } else if (
              typeof nullifyMap[objectName] === 'string' &&
              nullifyMap[objectName] !== getTableName(field.table)
            ) {
              nullifyMap[objectName] = false;
            }
          }
        }
      }
      return acc;
    },
    {},
  );
  if (joinsNotNullableMap && Object.keys(nullifyMap).length > 0) {
    for (const [objectName, tableName] of Object.entries(nullifyMap)) {
      if (typeof tableName === 'string' && !joinsNotNullableMap[tableName]) {
        result[objectName] = null;
      }
    }
  }
  return result;
}

/**
 * 用法：`const db = drizzle(new DatabaseSync(path))`。
 * node:sqlite 驱动不需要 schema 配置 —— 本项目的仓库层都直接引用表对象做查询，
 * 关系查询（db.query.*）没有用到。
 */
export function drizzle(client: DatabaseSync, config: { logger?: Logger | boolean } = {}): NodeSqliteDatabase {
  const dialect = new SQLiteSyncDialect();
  let logger: Logger | undefined;
  if (config.logger === true) logger = new DefaultLogger();
  else if (config.logger) logger = config.logger;

  const session = new NodeSqliteSession(client, dialect, { logger });
  return new BaseSQLiteDatabase('sync', dialect, session, undefined);
}
