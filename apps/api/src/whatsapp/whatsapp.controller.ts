import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConnectSessionDto } from './dto/connect-session.dto';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('session')
  getSession() {
    return this.whatsappService.getSession();
  }

  @Post('session/connect')
  connect(@Body() dto: ConnectSessionDto) {
    return this.whatsappService.connectSession(dto.label);
  }

  @Post('session/mock-scan')
  mockScan() {
    return this.whatsappService.mockScanSession();
  }
}
