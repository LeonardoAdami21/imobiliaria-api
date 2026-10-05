import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated, type AuthUser, CurrentUser } from '@/shared/infra/http/auth';
import { IdParamsDto } from '@/shared/infra/http/schemas';
import { FinishVisit, RescheduleVisit, ScheduleVisit, SearchVisits } from '../application/visit-use-cases';
import { FinishVisitDto, RescheduleVisitDto, ScheduleVisitDto, SearchVisitsQueryDto } from './dto';

@ApiTags('Visitas')
@Authenticated()
@Controller('visits')
export class VisitsController {
  constructor(
    @Inject(ScheduleVisit) private readonly scheduleVisit: ScheduleVisit,
    @Inject(RescheduleVisit) private readonly rescheduleVisit: RescheduleVisit,
    @Inject(FinishVisit) private readonly finishVisit: FinishVisit,
    @Inject(SearchVisits) private readonly searchVisits: SearchVisits,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Agendar visita de um lead a um imóvel' })
  schedule(@Body() body: ScheduleVisitDto, @CurrentUser() user: AuthUser) {
    return this.scheduleVisit.execute({ ...body, actor: user });
  }

  @Get()
  @ApiOperation({ summary: 'Agenda de visitas' })
  search(@Query() query: SearchVisitsQueryDto) {
    return this.searchVisits.execute(query);
  }

  @Post(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remarcar visita' })
  reschedule(@Param() params: IdParamsDto, @Body() body: RescheduleVisitDto) {
    return this.rescheduleVisit.execute({ id: params.id, scheduledAt: body.scheduledAt });
  }

  @Post(':id/finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Encerrar visita: realizada, cancelada ou cliente não compareceu' })
  finish(@Param() params: IdParamsDto, @Body() body: FinishVisitDto) {
    return this.finishVisit.execute({ id: params.id, ...body });
  }
}
