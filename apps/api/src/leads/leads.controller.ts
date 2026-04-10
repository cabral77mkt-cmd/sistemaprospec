import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { UpdatePipelineDto } from '../pipeline/dto/update-pipeline.dto';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { LeadsService } from './leads.service';

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  list(@Query() query: ListLeadsQueryDto) {
    return this.leadsService.listLeads(query);
  }

  @Get('candidates')
  listCandidates() {
    return this.leadsService.listCandidates();
  }

  @Post(':id/promote')
  promoteCandidate(
    @Param('id') id: string,
    @Req() request: Request & { user: AuthenticatedUser },
  ) {
    return this.leadsService.promoteCandidate(id, request.user.sub);
  }

  @Patch(':id/pipeline')
  updatePipeline(
    @Param('id') id: string,
    @Body() dto: UpdatePipelineDto,
    @Req() request: Request & { user: AuthenticatedUser },
  ) {
    return this.leadsService.updatePipeline(
      id,
      dto.status,
      dto.reason,
      request.user.sub,
    );
  }
}
