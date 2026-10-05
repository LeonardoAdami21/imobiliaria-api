import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { z } from 'zod';
import type { Env } from './config/env';

// Mensagens de validação do Zod em português.
z.config(z.locales.pt());

/** Middlewares, CORS e documentação. Compartilhado por main.ts e pelos testes de ponta a ponta. */
export function configureApp(app: NestExpressApplication, env: Pick<Env, 'AGENCY_NAME' | 'CORS_ORIGIN'>): void {
  const title = `API ${env.AGENCY_NAME}`;

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false })); // CSP desligada por causa da página do Swagger
  app.enableCors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim()) });
  app.useBodyParser('json', { limit: '1mb' });
  // JSON malformado: o body-parser falha antes do Nest, que só repassaria um "Bad Request" genérico.
  app.use((error: { type?: string }, _request: Request, response: Response, next: NextFunction) => {
    if (error.type !== 'entity.parse.failed') return next(error);
    response.status(400).json({ error: { code: 'INVALID_JSON', message: 'O corpo da requisição não é um JSON válido.' } });
  });

  const config = new DocumentBuilder()
    .setTitle(title)
    .setVersion('0.1.0')
    .setDescription(
      'Valores em dinheiro são enviados e devolvidos em centavos (R$ 1.500,00 = 150000). ' +
        'Datas de calendário usam o formato AAAA-MM-DD. ' +
        'Erros seguem o formato { "error": { "code", "message" } }.',
    )
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs.json', customSiteTitle: title });
}
