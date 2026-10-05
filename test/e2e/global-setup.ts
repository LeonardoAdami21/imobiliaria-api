import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { testDatabaseUrl } from './support';

/**
 * Prepara o banco de testes uma vez antes da suíte: cria o banco se não existir,
 * zera o schema e aplica os arquivos de migração do Prisma, na ordem.
 * Assim os testes também validam que as migrações constroem o banco do zero.
 */
export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const database = url.pathname.slice(1);

  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${database}"`);
  await admin.end();

  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  const migrationsDir = join(import.meta.dirname, '../../prisma/migrations');
  const migrations = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migration of migrations) {
    await client.query(readFileSync(join(migrationsDir, migration, 'migration.sql'), 'utf8'));
  }
  await client.end();
}
