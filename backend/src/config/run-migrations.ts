
import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function runMigrations() {
  const client = await pool.connect();

  try {
    const migrationsDir = path.resolve(process.cwd(), 'migrations');

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    const files = (await fs.readdir(migrationsDir))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();

    for (const file of files) {
      const alreadyExecuted = await client.query(
        'SELECT filename FROM schema_migrations WHERE filename = $1',
        [file],
      );

      if (alreadyExecuted.rowCount && alreadyExecuted.rowCount > 0) {
        console.log(`Já executada, ignorando: ${file}`);
        continue;
      }

      const sql = await fs.readFile(
        path.join(migrationsDir, file),
        'utf8',
      );

      console.log(`Executando: ${file}`);
      await client.query('BEGIN');

      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        console.log(`Concluída: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log('Processo de migrations concluído!');
  } catch (error) {
    console.error('Erro ao executar migrations:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
