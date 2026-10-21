import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { logger } from '../logging/logger.js';
import { dbQueryDurationHistogram } from '../metrics/index.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface IQueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export class DatabaseService {
  private static instance: DatabaseService;
  private pool: pg.Pool | null = null;
  private isConnected = false;

  private constructor() {
    // Lazily initialized in connect()
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async connect(): Promise<boolean> {
    try {
      const connectionString = config.DATABASE_URL;

      this.pool = new Pool({
        connectionString,
        host: config.DB_HOST,
        port: config.DB_PORT,
        user: config.DB_USER,
        password: config.DB_PASSWORD,
        database: config.DB_NAME,
        max: config.DB_POOL_MAX,
        idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MILLIS,
        connectionTimeoutMillis: 5000,
      });

      this.pool.on('error', (err) => {
        logger.error({ err }, 'Unexpected database client error in connection pool');
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      this.isConnected = true;
      logger.info({ host: config.DB_HOST, db: config.DB_NAME }, '✅ PostgreSQL connection pool established successfully');

      // Run schema migrations
      await this.runMigrations();
      return true;
    } catch (err: any) {
      logger.warn(
        { message: err.message },
        '⚠️ PostgreSQL connection failed or host not reachable. Falling back to High-Performance In-Memory Store for local zero-dependency testing.'
      );
      this.isConnected = false;
      return false;
    }
  }

  public get isDbConnected(): boolean {
    return this.isConnected;
  }

  public getPool(): pg.Pool | null {
    return this.pool;
  }

  public async query<T = any>(text: string, params: any[] = []): Promise<IQueryResult<T>> {
    if (!this.pool || !this.isConnected) {
      throw new Error('Database pool is not connected');
    }

    const timer = dbQueryDurationHistogram.startTimer({
      operation: text.trim().split(' ')[0]?.toUpperCase() || 'UNKNOWN',
      table: 'dynamic',
    });

    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      timer();
      const durationMs = Date.now() - start;
      if (durationMs > 200) {
        logger.warn({ durationMs, query: text.substring(0, 100) }, 'Slow database query detected');
      }
      return {
        rows: res.rows,
        rowCount: res.rowCount ?? 0,
      };
    } catch (error) {
      timer();
      logger.error({ error, query: text.substring(0, 100) }, 'Database query execution failed');
      throw error;
    }
  }

  public async withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool || !this.isConnected) {
      throw new Error('Database pool is not connected');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async runMigrations(): Promise<void> {
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        await this.query(sql);
        logger.info('✅ Database schema migrations applied successfully');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to run schema migrations');
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database pool closed');
    }
  }
}

export const dbService = DatabaseService.getInstance();
