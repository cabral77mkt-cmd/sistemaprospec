import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { HandoffDto } from './dto/handoff.dto';
import { SimulateInboundDto } from './dto/simulate-inbound.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  list(@Query('leadId') leadId?: string) {
    return this.conversationsService.list(leadId);
  }

  @Post(':id/handoff')
  handoff(@Param('id') id: string, @Body() dto: HandoffDto) {
    return this.conversationsService.handoffConversation(id, dto.note);
  }

  @Post(':id/inbound')
  simulateInbound(@Param('id') id: string, @Body() dto: SimulateInboundDto) {
    return this.conversationsService.handleInboundReply(id, dto.content);
  }
}
