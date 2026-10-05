import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated } from '@/shared/infra/http/auth';
import { IdParamsDto } from '@/shared/infra/http/schemas';
import { GetPerson, RegisterPerson, SearchPeople, UpdatePerson } from '../application/person-use-cases';
import { RegisterPersonDto, SearchPeopleQueryDto, UpdatePersonDto } from './dto';

@ApiTags('Pessoas')
@Authenticated()
@Controller('people')
export class PeopleController {
  constructor(
    @Inject(RegisterPerson) private readonly registerPerson: RegisterPerson,
    @Inject(UpdatePerson) private readonly updatePerson: UpdatePerson,
    @Inject(GetPerson) private readonly getPerson: GetPerson,
    @Inject(SearchPeople) private readonly searchPeople: SearchPeople,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Cadastrar pessoa (proprietário, inquilino, comprador ou fiador)' })
  register(@Body() body: RegisterPersonDto) {
    return this.registerPerson.execute(body);
  }

  @Get()
  @ApiOperation({ summary: 'Buscar pessoas por nome ou documento' })
  search(@Query() query: SearchPeopleQueryDto) {
    return this.searchPeople.execute(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar pessoa' })
  get(@Param() params: IdParamsDto) {
    return this.getPerson.execute(params);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Alterar dados de contato da pessoa' })
  update(@Param() params: IdParamsDto, @Body() body: UpdatePersonDto) {
    return this.updatePerson.execute({ id: params.id, ...body });
  }
}
