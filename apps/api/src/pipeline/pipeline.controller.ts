import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { PipelineService } from './pipeline.service';

@Controller('pipeline')
@UseGuards(JwtAuthGuard)
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get()
  getBoard() {
    return this.pipelineService.getBoard();
  }

  @Patch('/leads/:id')
  updateLeadStatus(
    @Param('id') leadId: string,
    @Body() dto: UpdatePipelineDto,
    @Req() request: Request & { user: AuthenticatedUser },
  ) {
    return this.pipelineService.updateLeadStatus(
      leadId,
      dto.status,
      dto.reason,
      request.user.sub,
    );
  }
}
