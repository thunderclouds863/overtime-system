import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// Paksa kolom INTERVAL (OID 1186) dikembalikan sebagai string "HH:MM:SS"
// Biar konsisten dan tidak berubah-ubah tergantung versi driver
pg.types.setTypeParser(1186, (val) => val);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('[DB]', { duration, rows: res.rowCount });
  return res;
}
