import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LeadsModule } from '../leads/leads.module';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [PrismaModule, LeadsModule, ScoringModule],
  providers: [ConversationsService],
  controllers: [ConversationsController],
  exports: [ConversationsService],
})
export class ConversationsModule {}
