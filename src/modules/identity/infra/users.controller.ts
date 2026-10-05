import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated, type AuthUser, CurrentUser, Roles } from '@/shared/infra/http/auth';
import { IdParamsDto } from '@/shared/infra/http/schemas';
import { GetUser, ListUsers, RegisterUser, UpdateUser } from '../application/user-use-cases';
import { ListUsersQueryDto, RegisterUserDto, UpdateUserDto } from './dto';

const MANAGEMENT = ['ADMIN', 'MANAGER'];

@ApiTags('Usuários')
@Authenticated()
@Controller('users')
export class UsersController {
  constructor(
    @Inject(RegisterUser) private readonly registerUser: RegisterUser,
    @Inject(GetUser) private readonly getUser: GetUser,
    @Inject(ListUsers) private readonly listUsers: ListUsers,
    @Inject(UpdateUser) private readonly updateUser: UpdateUser,
  ) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Cadastrar usuário (corretor, gerente, financeiro ou administrador)' })
  register(@Body() body: RegisterUserDto) {
    return this.registerUser.execute(body);
  }

  @Get()
  @Roles(...MANAGEMENT)
  @ApiOperation({ summary: 'Listar usuários' })
  list(@Query() query: ListUsersQueryDto) {
    return this.listUsers.execute(query);
  }

  @Get(':id')
  @Roles(...MANAGEMENT)
  @ApiOperation({ summary: 'Consultar usuário' })
  get(@Param() params: IdParamsDto) {
    return this.getUser.execute(params);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Alterar nome, papel, CRECI ou ativar/desativar usuário' })
  update(@Param() params: IdParamsDto, @Body() body: UpdateUserDto, @CurrentUser() user: AuthUser) {
    return this.updateUser.execute({ id: params.id, actorId: user.id, ...body });
  }
}
