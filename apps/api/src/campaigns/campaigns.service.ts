import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CampaignBatchStatus,
  CampaignLeadStatus,
  LeadPipelineStatus,
} from '@prisma/client';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { StartCampaignDto } from './dto/start-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
  ) {}

  async startCampaign(dto: StartCampaignDto, requestedById?: string) {
    const dailyLimit = dto.dailyLimit ?? 20;
    const leadIds = [...new Set(dto.leadIds)];

    if (leadIds.length > 20 && !dto.overrideDailyLimit) {
      throw new BadRequestException(
        'O lote ultrapassa o limite padrao de 20 contatos/dia. Use overrideDailyLimit para assumir o envio maior.',
      );
    }

    if (dailyLimit > 20 && !dto.overrideDailyLimit) {
      throw new BadRequestException(
        'Para operar acima do limite diario conservador, ative overrideDailyLimit.',
      );
    }

    const leads = await this.prisma.lead.findMany({
      where: {
        id: {
          in: leadIds,
        },
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    });

    if (leads.length === 0) {
      throw new BadRequestException(
        'Nenhum lead valido foi selecionado para a campanha.',
      );
    }

    const batch = await this.prisma.campaignBatch.create({
      data: {
        name:
          dto.name ??
          `Lote ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString(
            'pt-BR',
            {
              hour: '2-digit',
              minute: '2-digit',
            },
          )}`,
        status: CampaignBatchStatus.RUNNING,
        dailyLimit,
        overrideDailyLimit: Boolean(dto.overrideDailyLimit),
        windowStart: dto.windowStart ?? '09:00',
        windowEnd: dto.windowEnd ?? '18:00',
        requestedById,
        startedAt: new Date(),
      },
    });

    const selectedLeads = leads.slice(
      0,
      dto.overrideDailyLimit ? leadIds.length : dailyLimit,
    );
    const results = [];

    for (const lead of selectedLeads) {
      const blockedStatuses = new Set<LeadPipelineStatus>([
        LeadPipelineStatus.MEETING_HANDOFF,
        LeadPipelineStatus.WON,
        LeadPipelineStatus.LOST,
      ]);

      if (blockedStatuses.has(lead.pipelineStatus)) {
        await this.prisma.campaignBatchLead.create({
          data: {
            campaignBatchId: batch.id,
            leadId: lead.id,
            status: CampaignLeadStatus.SKIPPED,
          },
        });
        continue;
      }

      const conversation =
        await this.conversationsService.startQualificationConversation(
          lead.id,
          batch.id,
        );

      const hasOutboundMessage = conversation.messages.some(
        (message) => message.direction === 'OUTBOUND',
      );

      await this.prisma.campaignBatchLead.create({
        data: {
          campaignBatchId: batch.id,
          leadId: lead.id,
          conversationId: conversation.id,
          status: hasOutboundMessage
            ? CampaignLeadStatus.SENT
            : CampaignLeadStatus.QUEUED,
          sentAt: hasOutboundMessage ? new Date() : null,
          lastAttemptAt: new Date(),
        },
      });

      results.push({
        leadId: lead.id,
        conversationId: conversation.id,
        status: hasOutboundMessage
          ? CampaignLeadStatus.SENT
          : CampaignLeadStatus.QUEUED,
      });
    }

    const completedBatch = await this.prisma.campaignBatch.update({
      where: { id: batch.id },
      data: {
        status: CampaignBatchStatus.COMPLETED,
        completedAt: new Date(),
      },
      include: {
        selectedLeads: true,
      },
    });

    return {
      ...completedBatch,
      results,
    };
  }
}
