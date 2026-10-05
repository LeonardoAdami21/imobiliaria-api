import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { Authenticated, type AuthUser, CurrentUser } from '@/shared/infra/http/auth';
import { IdParamsDto } from '@/shared/infra/http/schemas';
import {
  AssignLead,
  ChangeLeadStatus,
  CreateLead,
  GetLead,
  SearchLeads,
  UpdateLead,
} from '../application/lead-use-cases';
import {
  AssignLeadDto,
  type ChangeLeadStatusBody,
  changeLeadStatusBody,
  CreateLeadDto,
  SearchLeadsQueryDto,
  UpdateLeadDto,
} from './dto';

/** O usuário autenticado vai como "actor": é ele que define a carteira do corretor. */
@ApiTags('Leads')
@Authenticated()
@Controller('leads')
export class LeadsController {
  constructor(
    @Inject(CreateLead) private readonly createLead: CreateLead,
    @Inject(UpdateLead) private readonly updateLead: UpdateLead,
    @Inject(AssignLead) private readonly assignLead: AssignLead,
    @Inject(ChangeLeadStatus) private readonly changeLeadStatus: ChangeLeadStatus,
    @Inject(GetLead) private readonly getLead: GetLead,
    @Inject(SearchLeads) private readonly searchLeads: SearchLeads,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Registrar lead (interessado em comprar ou alugar; o lead do corretor entra na carteira dele)' })
  create(@Body() body: CreateLeadDto, @CurrentUser() user: AuthUser) {
    return this.createLead.execute({ ...body, actor: user });
  }

  @Get()
  @ApiOperation({ summary: 'Listar leads por etapa do funil, interesse ou corretor (corretor vê apenas os seus)' })
  search(@Query() query: SearchLeadsQueryDto, @CurrentUser() user: AuthUser) {
    return this.searchLeads.execute({ ...query, actor: user });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar lead' })
  get(@Param() params: IdParamsDto, @CurrentUser() user: AuthUser) {
    return this.getLead.execute({ ...params, actor: user });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Alterar dados do lead' })
  update(@Param() params: IdParamsDto, @Body() body: UpdateLeadDto, @CurrentUser() user: AuthUser) {
    return this.updateLead.execute({ id: params.id, ...body, actor: user });
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atribuir o lead a um corretor' })
  assign(@Param() params: IdParamsDto, @Body() body: AssignLeadDto, @CurrentUser() user: AuthUser) {
    return this.assignLead.execute({ id: params.id, brokerId: body.brokerId, actor: user });
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mover o lead no funil: avançar etapa, ganhar, perder ou reabrir' })
  @ApiBody({ schema: z.toJSONSchema(changeLeadStatusBody, { io: 'input', target: 'openapi-3.0' }) as object })
  changeStatus(
    @Param() params: IdParamsDto,
    @Body(new ZodValidationPipe(changeLeadStatusBody)) body: ChangeLeadStatusBody,
    @CurrentUser() user: AuthUser,
  ) {
    return this.changeLeadStatus.execute({ id: params.id, ...body, actor: user });
  }
}
