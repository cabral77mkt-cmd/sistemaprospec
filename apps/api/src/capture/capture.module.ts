import { Module } from '@nestjs/common';
import { CaptureService } from './capture.service';
import { CaptureController } from './capture.controller';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [LeadsModule],
  providers: [CaptureService],
  controllers: [CaptureController],
})
export class CaptureModule {}
