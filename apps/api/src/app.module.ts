import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { LeadsModule } from './leads/leads.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CaptureModule } from './capture/capture.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ConversationsModule } from './conversations/conversations.module';
import { ScoringModule } from './scoring/scoring.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { CampaignsModule } from './campaigns/campaigns.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    LeadsModule,
    DashboardModule,
    CaptureModule,
    WhatsappModule,
    ConversationsModule,
    ScoringModule,
    PipelineModule,
    CampaignsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
