
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

async function runSeed() {
  const client = await pool.connect();

  try {
    const seedPath = path.resolve(process.cwd(), 'seed.sql');
    const sql = await fs.readFile(seedPath, 'utf8');

    await client.query(sql);

    console.log('Seed executado com sucesso!');
  } catch (error) {
    console.error('Erro ao executar o seed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed();
