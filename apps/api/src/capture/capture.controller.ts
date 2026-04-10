import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RunCaptureDto } from './dto/run-capture.dto';
import { CaptureService } from './capture.service';

@Controller('capture')
@UseGuards(JwtAuthGuard)
export class CaptureController {
  constructor(private readonly captureService: CaptureService) {}

  @Post('run')
  runCapture(@Body() dto: RunCaptureDto) {
    return this.captureService.runCapture(dto);
  }
}
