import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated, type AuthUser, CurrentUser, Roles } from '@/shared/infra/http/auth';
import { IdParamsDto } from '@/shared/infra/http/schemas';
import { CreateProposal, DecideProposal, GetProposal, SearchProposals } from '../application/proposal-use-cases';
import { CreateProposalDto, RejectProposalDto, SearchProposalsQueryDto } from './dto';

const NEGOTIATORS = ['ADMIN', 'MANAGER', 'BROKER'];
const MANAGEMENT = ['ADMIN', 'MANAGER'];

@ApiTags('Propostas')
@Authenticated()
@Controller('proposals')
export class ProposalsController {
  constructor(
    @Inject(CreateProposal) private readonly createProposal: CreateProposal,
    @Inject(DecideProposal) private readonly decideProposal: DecideProposal,
    @Inject(GetProposal) private readonly getProposal: GetProposal,
    @Inject(SearchProposals) private readonly searchProposals: SearchProposals,
  ) {}

  @Post()
  @Roles(...NEGOTIATORS)
  @ApiOperation({ summary: 'Registrar proposta de compra' })
  create(@Body() body: CreateProposalDto, @CurrentUser() user: AuthUser) {
    return this.createProposal.execute({ ...body, brokerId: body.brokerId ?? user.id });
  }

  @Get()
  @ApiOperation({ summary: 'Listar propostas' })
  search(@Query() query: SearchProposalsQueryDto) {
    return this.searchProposals.execute(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar proposta' })
  get(@Param() params: IdParamsDto) {
    return this.getProposal.execute(params);
  }

  @Post(':id/accept')
  @Roles(...MANAGEMENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aceitar proposta (reserva o imóvel)' })
  accept(@Param() params: IdParamsDto) {
    return this.decideProposal.execute({ id: params.id, decision: 'ACCEPT' });
  }

  @Post(':id/reject')
  @Roles(...MANAGEMENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recusar proposta' })
  reject(@Param() params: IdParamsDto, @Body() body: RejectProposalDto) {
    return this.decideProposal.execute({ id: params.id, decision: 'REJECT', reason: body.reason });
  }

  @Post(':id/cancel')
  @Roles(...NEGOTIATORS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar proposta por desistência do comprador (libera o imóvel se estava reservado)' })
  cancel(@Param() params: IdParamsDto) {
    return this.decideProposal.execute({ id: params.id, decision: 'CANCEL' });
  }
}
