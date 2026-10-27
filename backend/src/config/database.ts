//conexão com o banco
//Esse arquivo cria um pool de conexões, mecanismo que permite ao backend reutilizar conexões com o PostgreSQL.
import 'dotenv/config';
import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('error', (error) =>{
    console.error('Erro inesperado no pool do PostgreSQL', error);

});