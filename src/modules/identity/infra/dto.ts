import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { optionalText, pagination, queryBoolean } from '@/shared/infra/http/schemas';
import { USER_ROLES } from '../domain/user';

const role = z.enum(USER_ROLES);

// Exemplo = administrador do .env.example, para o "Try it out" do Swagger funcionar de primeira.
export class LoginDto extends createZodDto(
  z.object({
    email: z.email().meta({ example: 'admin@imobiliaria.com.br' }),
    password: z.string().min(1).meta({ example: 'TroqueEstaSenha123' }),
  }),
) {}

export class ChangePasswordDto extends createZodDto(
  z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) }),
) {}

export class RegisterUserDto extends createZodDto(
  z.object({
    name: z.string().trim().min(2).max(120),
    email: z.email(),
    password: z.string().min(8).max(200),
    role,
    creci: optionalText(30),
  }),
) {}

export class ListUsersQueryDto extends createZodDto(
  z.object({ ...pagination, role: role.optional(), active: queryBoolean.optional() }),
) {}

export class UpdateUserDto extends createZodDto(
  z.object({
    name: z.string().trim().min(2).max(120).optional(),
    role: role.optional(),
    creci: optionalText(30),
    active: z.boolean().optional(),
  }),
) {}
