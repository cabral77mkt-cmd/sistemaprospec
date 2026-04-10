import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { StartCampaignDto } from './dto/start-campaign.dto';
import { CampaignsService } from './campaigns.service';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post('start')
  start(
    @Body() dto: StartCampaignDto,
    @Req() request: Request & { user: AuthenticatedUser },
  ) {
    return this.campaignsService.startCampaign(dto, request.user.sub);
  }
}
