import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// No Prisma 7 a URL do banco fica aqui (usada pelo CLI: migrate, studio),
// e não mais dentro do schema.prisma. `prisma generate` não precisa de banco,
// por isso a URL é lida direto de process.env, sem exigir que exista.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
