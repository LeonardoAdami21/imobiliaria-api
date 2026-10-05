import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated, type AuthUser, CurrentUser, Public } from '@/shared/infra/http/auth';
import { Authenticate, ChangeOwnPassword, GetUser } from '../application/user-use-cases';
import { ChangePasswordDto, LoginDto } from './dto';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(Authenticate) private readonly authenticate: Authenticate,
    @Inject(ChangeOwnPassword) private readonly changeOwnPassword: ChangeOwnPassword,
    @Inject(GetUser) private readonly getUser: GetUser,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Entrar com e-mail e senha e receber o token de acesso' })
  login(@Body() body: LoginDto) {
    return this.authenticate.execute(body);
  }

  @Authenticated()
  @Get('me')
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  me(@CurrentUser() user: AuthUser) {
    return this.getUser.execute({ id: user.id });
  }

  @Authenticated()
  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Trocar a própria senha' })
  changePassword(@Body() body: ChangePasswordDto, @CurrentUser() user: AuthUser) {
    return this.changeOwnPassword.execute({ userId: user.id, ...body });
  }
}
