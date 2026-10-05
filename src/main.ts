import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadEnv } from './config/env';
import { EnsureAdminUser } from './modules/identity/application/user-use-cases';

async function bootstrap(): Promise<void> {
  // Valida o .env antes de subir o Nest, para falhar com uma mensagem clara.
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app, env);
  app.enableShutdownHooks(); // SIGTERM/SIGINT: termina as requisições e fecha o banco

  // Primeiro acesso: sem nenhum usuário no banco, cria o administrador definido no .env.
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const created = await app.get(EnsureAdminUser).execute({
      name: env.ADMIN_NAME,
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
    });
    if (created) console.log(`Administrador inicial criado: ${env.ADMIN_EMAIL}`);
  }

  await app.listen(env.PORT);
  console.log(`${env.AGENCY_NAME}: API no ar em http://localhost:${env.PORT} (documentação em /docs)`);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
