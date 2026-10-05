import cors from 'cors';
import express, { type ErrorRequestHandler, type Express, type Request } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { z, ZodError } from 'zod';
import { AppError, type ErrorKind, ForbiddenError, UnauthorizedError } from '@/shared/domain/errors';
import { buildOpenApiDocument } from './openapi';
import type { AuthUser, Route } from './route';

export interface HttpAppOptions {
  routes: Route[];
  /** Resolve o token Bearer em um usuário ativo, ou null se for inválido. */
  authenticate: (token: string) => Promise<AuthUser | null>;
  corsOrigin: string;
  title: string;
  logger?: Pick<Console, 'error'>;
}

// Mensagens de validação do Zod em português.
z.config(z.locales.pt());

const STATUS_BY_KIND: Record<ErrorKind, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  business_rule: 422,
};

function bearerToken(request: Request): string | null {
  const [scheme, token] = (request.headers.authorization ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Monta a aplicação Express a partir das rotas declaradas pelos módulos. */
export function createHttpApp(options: HttpAppOptions): Express {
  const app = express();
  const logger = options.logger ?? console;

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false })); // CSP desligada por causa da página do Swagger
  app.use(cors({ origin: options.corsOrigin === '*' ? true : options.corsOrigin.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '1mb' }));

  const document = buildOpenApiDocument(options.routes, options.title);
  app.get('/docs.json', (_request, response) => void response.json(document));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(document, { customSiteTitle: options.title }));

  for (const route of options.routes) {
    app[route.method](route.path, async (request, response) => {
      let user: AuthUser = { id: '', role: '' };
      if (!route.public) {
        const token = bearerToken(request);
        const authenticated = token ? await options.authenticate(token) : null;
        if (!authenticated) throw new UnauthorizedError('Token ausente, inválido ou expirado.', 'INVALID_TOKEN');
        if (route.roles && !route.roles.includes(authenticated.role)) throw new ForbiddenError();
        user = authenticated;
      }

      const result = await route.handler({
        params: route.params ? route.params.parse(request.params) : undefined,
        query: route.query ? route.query.parse(request.query) : undefined,
        body: route.body ? route.body.parse(request.body ?? {}) : undefined,
        user,
      });

      if (result === undefined) response.status(route.status ?? 204).end();
      else response.status(route.status ?? 200).json(result);
    });
  }

  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Rota não encontrada.' } });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof AppError) {
      response.status(STATUS_BY_KIND[error.kind]).json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof ZodError) {
      response.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Dados da requisição inválidos.',
          details: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
        },
      });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      response.status(400).json({ error: { code: 'INVALID_JSON', message: 'O corpo da requisição não é um JSON válido.' } });
      return;
    }
    // Violação de chave única ou estrangeira que escapou das validações (ex.: duas requisições simultâneas).
    const code = (error as { code?: string }).code;
    if (code === 'P2002' || code === 'P2003') {
      response.status(409).json({ error: { code: 'CONFLICT', message: 'Operação em conflito com dados já existentes.' } });
      return;
    }
    logger.error(error);
    response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' } });
  };
  app.use(errorHandler);

  return app;
}
