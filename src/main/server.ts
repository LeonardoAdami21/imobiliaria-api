import { createPrismaClient } from '@/shared/infra/database/prisma';
import { createApplication } from './app';
import { loadEnv } from './env';

async function main(): Promise<void> {
  const env = loadEnv();
  const prisma = createPrismaClient(env.DATABASE_URL);
  const { http, container } = createApplication(env, prisma);

  // Primeiro acesso: sem nenhum usuário no banco, cria o administrador definido no .env.
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const created = await container.useCases.identity.ensureAdminUser.execute({
      name: env.ADMIN_NAME,
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
    });
    if (created) console.log(`Administrador inicial criado: ${env.ADMIN_EMAIL}`);
  }

  const server = http.listen(env.PORT, () => {
    console.log(`${env.AGENCY_NAME}: API no ar em http://localhost:${env.PORT} (documentação em /docs)`);
  });

  // Encerramento limpo: termina as requisições em andamento antes de fechar o banco.
  const shutdown = (signal: string): void => {
    console.log(`${signal} recebido, encerrando...`);
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
