import { Pool, type QueryResult, type QueryResultRow } from 'pg';

/**
 * Connection to ecod_protein on dione:45000, used ONLY for the curator side:
 * sessions (ecod_curation.curator / curator_session, shared with pyecod_vis)
 * and the decision log (ecod_curation.reference_domain_actions). Case data
 * never comes from here; see the snapshot rule in data.ts. No password:
 * node-postgres falls back to ~/.pgpass.
 */
const config = {
  host: process.env.DB_HOST || 'dione',
  port: parseInt(process.env.DB_PORT || '45000', 10),
  database: process.env.DB_NAME || 'ecod_protein',
  user: process.env.DB_USER || 'ecod',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const g = globalThis as unknown as { provPool?: Pool };

export function getPool(): Pool {
  if (!g.provPool) {
    g.provPool = new Pool(config);
    g.provPool.on('error', (err) => console.error('idle pg client error', err));
  }
  return g.provPool;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function query<T extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}
