import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { AppError, type ErrorKind } from '@/shared/domain/errors';

const STATUS_BY_KIND: Record<ErrorKind, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  business_rule: 422,
};

const CODE_BY_STATUS: Record<number, string> = {
  400: 'INVALID_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'ROUTE_NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
};

interface ErrorBody {
  code: string;
  message: string;
  details?: { field: string; message: string }[];
}

function zodDetails(error: ZodError): ErrorBody {
  return {
    code: 'INVALID_REQUEST',
    message: 'Dados da requisição inválidos.',
    details: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
  };
}

/**
 * Traduz qualquer erro para o formato { "error": { "code", "message" } }.
 * Os erros de domínio (AppError) não sabem o que é HTTP: o status sai daqui.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(error: unknown, host: ArgumentsHost): void {
    const [status, body] = this.translate(error);
    host.switchToHttp().getResponse<Response>().status(status).json({ error: body });
  }

  private translate(error: unknown): [number, ErrorBody] {
    if (error instanceof AppError) {
      return [STATUS_BY_KIND[error.kind], { code: error.code, message: error.message }];
    }
    if (error instanceof ZodValidationException) {
      const zodError = error.getZodError();
      if (zodError instanceof ZodError) return [400, zodDetails(zodError)];
    }
    if (error instanceof ZodError) return [400, zodDetails(error)];

    if (error instanceof HttpException) {
      const status = error.getStatus();
      if (status === HttpStatus.NOT_FOUND) return [404, { code: 'ROUTE_NOT_FOUND', message: 'Rota não encontrada.' }];
      return [status, { code: CODE_BY_STATUS[status] ?? 'HTTP_ERROR', message: error.message }];
    }

    // Violação de chave única ou estrangeira que escapou das validações (ex.: duas requisições simultâneas).
    const code = (error as { code?: string }).code;
    if (code === 'P2002' || code === 'P2003') {
      return [409, { code: 'CONFLICT', message: 'Operação em conflito com dados já existentes.' }];
    }

    this.logger.error(error instanceof Error ? (error.stack ?? error.message) : error);
    return [500, { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' }];
  }
}
