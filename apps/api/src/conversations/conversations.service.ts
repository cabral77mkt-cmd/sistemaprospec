import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ConversationStatus,
  LeadPipelineStatus,
  MessageDirection,
  MessageType,
  QualificationStep,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeadsService } from '../leads/leads.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadsService: LeadsService,
  ) {}

  async list(leadId?: string) {
    return this.prisma.conversation.findMany({
      where: {
        leadId,
      },
      include: {
        lead: true,
        qualification: true,
        messages: {
          orderBy: { sentAt: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async startQualificationConversation(
    leadId: string,
    campaignBatchId?: string,
  ) {
    const existingConversation = await this.prisma.conversation.findFirst({
      where: {
        leadId,
        status: {
          in: [
            ConversationStatus.PENDING,
            ConversationStatus.ACTIVE,
            ConversationStatus.NEEDS_REVIEW,
          ],
        },
      },
      include: {
        lead: true,
        qualification: true,
        messages: {
          orderBy: { sentAt: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (existingConversation) {
      return existingConversation;
    }

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new NotFoundException('Lead nao encontrado para iniciar conversa.');
    }

    const openingMessage = this.buildOpeningMessage(lead.name);

    const conversation = await this.prisma.conversation.create({
      data: {
        leadId,
        campaignBatchId,
        status: ConversationStatus.ACTIVE,
        currentStep: QualificationStep.RESPONSIBLE,
        messages: {
          create: {
            direction: MessageDirection.OUTBOUND,
            type: MessageType.QUALIFICATION,
            content: openingMessage,
          },
        },
      },
      include: {
        lead: true,
        qualification: true,
        messages: {
          orderBy: { sentAt: 'asc' },
        },
      },
    });

    if (
      lead.pipelineStatus === LeadPipelineStatus.LEAD_FOUND ||
      lead.pipelineStatus === LeadPipelineStatus.LEAD_QUALIFIED
    ) {
      await this.leadsService.updatePipeline(
        leadId,
        LeadPipelineStatus.CONTACT_STARTED,
        'Contato iniciado em lote manual',
      );
    }

    return conversation;
  }

  async handleInboundReply(conversationId: string, content: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        lead: true,
        qualification: true,
        messages: {
          orderBy: { sentAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    await this.prisma.message.create({
      data: {
        conversationId,
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        content,
        read: true,
      },
    });

    if (this.requiresHumanReview(content)) {
      return this.sendToHumanReview(
        conversationId,
        'Mensagem ambigua ou fora de contexto',
      );
    }

    let nextStep = conversation.currentStep;
    let nextMessage = '';
    let shouldRefreshScore = false;

    switch (conversation.currentStep) {
      case QualificationStep.RESPONSIBLE: {
        const responsible = this.parseYesNo(content);
        if (responsible === false) {
          return this.sendToHumanReview(
            conversationId,
            'Contato nao confirmou ser responsavel pelos eventos',
          );
        }

        await this.upsertQualification(conversationId, conversation.leadId, {
          responsibleAnswer: content,
          isResponsible: responsible ?? true,
        });
        nextStep = QualificationStep.EVENT_TYPE;
        nextMessage =
          'Perfeito. Que tipo de evento voces fazem hoje com mais frequencia?';
        shouldRefreshScore = true;
        break;
      }
      case QualificationStep.EVENT_TYPE: {
        const eventType = this.extractEventType(content) ?? content.trim();
        await this.upsertQualification(conversationId, conversation.leadId, {
          eventTypeAnswer: eventType,
        });
        await this.prisma.lead.update({
          where: { id: conversation.leadId },
          data: {
            eventType,
            pipelineStatus: LeadPipelineStatus.IN_CONVERSATION,
          },
        });
        nextStep = QualificationStep.AUDIENCE;
        nextMessage =
          'E em media qual e o porte dos eventos de voces? Pode ser numero de publico mesmo.';
        shouldRefreshScore = true;
        break;
      }
      case QualificationStep.AUDIENCE: {
        const estimatedAudience = this.parseAudience(content);
        await this.upsertQualification(conversationId, conversation.leadId, {
          audienceSizeAnswer: content,
          estimatedAudience,
        });
        nextStep = QualificationStep.COMMERCIAL_STACK;
        nextMessage =
          'Hoje voces ja vendem ingresso online ou investem em trafego pago para os eventos?';
        shouldRefreshScore = true;
        break;
      }
      case QualificationStep.COMMERCIAL_STACK: {
        const stack = this.parseCommercialStack(content);
        await this.upsertQualification(conversationId, conversation.leadId, {
          sellsOnline: stack.sellsOnline,
          paidTraffic: stack.paidTraffic,
        });
        nextStep = QualificationStep.NEXT_EVENT;
        nextMessage =
          'Show. E quando e o proximo evento de voces ou a proxima data relevante?';
        shouldRefreshScore = true;
        break;
      }
      case QualificationStep.NEXT_EVENT: {
        await this.upsertQualification(conversationId, conversation.leadId, {
          nextEventAt: content.trim(),
          completedAt: new Date(),
        });
        nextStep = QualificationStep.COMPLETE;
        nextMessage =
          'Fechou. Faz sentido nosso time te chamar para alinhar um papo rapido e ver se conseguimos ajudar na operacao/comercial do proximo evento?';
        shouldRefreshScore = true;
        break;
      }
      case QualificationStep.COMPLETE: {
        const interested = this.parseYesNo(content);
        if (interested === false) {
          await this.prisma.conversation.update({
            where: { id: conversationId },
            data: {
              status: ConversationStatus.LOST,
              aiSummary:
                'Lead concluiu a qualificacao mas recusou o convite para reuniao.',
            },
          });
          await this.leadsService.updatePipeline(
            conversation.leadId,
            LeadPipelineStatus.LOST,
            'Recusou convite para reuniao',
          );
          return this.prisma.conversation.findUniqueOrThrow({
            where: { id: conversationId },
            include: {
              lead: true,
              qualification: true,
              messages: {
                orderBy: { sentAt: 'asc' },
              },
            },
          });
        }

        return this.handoffConversation(
          conversationId,
          'Lead demonstrou interesse em avancar para reuniao.',
        );
      }
      case QualificationStep.HUMAN_REVIEW:
      default:
        return this.sendToHumanReview(
          conversationId,
          'Fluxo caiu em etapa nao suportada automaticamente',
        );
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        currentStep: nextStep,
        status: ConversationStatus.ACTIVE,
        needsHumanReview: false,
      },
    });

    await this.prisma.message.create({
      data: {
        conversationId,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.QUALIFICATION,
        content: nextMessage,
      },
    });

    if (shouldRefreshScore) {
      await this.leadsService.refreshLeadScore(conversation.leadId);
    }

    return this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: {
        lead: true,
        qualification: true,
        messages: {
          orderBy: { sentAt: 'asc' },
        },
      },
    });
  }

  async handoffConversation(conversationId: string, note?: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: ConversationStatus.HANDOFF,
        currentStep: QualificationStep.COMPLETE,
        meetingRequested: true,
        aiSummary: note ?? 'Lead qualificado e pronto para handoff manual.',
      },
    });

    if (note) {
      await this.prisma.message.create({
        data: {
          conversationId,
          direction: MessageDirection.SYSTEM,
          type: MessageType.STATUS_UPDATE,
          content: note,
        },
      });
    }

    await this.leadsService.updatePipeline(
      conversation.leadId,
      LeadPipelineStatus.MEETING_HANDOFF,
      note ?? 'Lead pronto para handoff comercial',
    );

    return this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: {
        lead: true,
        qualification: true,
        messages: {
          orderBy: { sentAt: 'asc' },
        },
      },
    });
  }

  private async sendToHumanReview(conversationId: string, reason: string) {
    const conversation = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: ConversationStatus.NEEDS_REVIEW,
        currentStep: QualificationStep.HUMAN_REVIEW,
        needsHumanReview: true,
        aiSummary: reason,
        messages: {
          create: {
            direction: MessageDirection.SYSTEM,
            type: MessageType.STATUS_UPDATE,
            content: `Revisao humana necessaria: ${reason}`,
          },
        },
      },
      include: {
        lead: true,
        qualification: true,
        messages: {
          orderBy: { sentAt: 'asc' },
        },
      },
    });

    await this.leadsService.updatePipeline(
      conversation.leadId,
      LeadPipelineStatus.IN_CONVERSATION,
      reason,
    );

    return conversation;
  }

  private async upsertQualification(
    conversationId: string,
    leadId: string,
    data: {
      responsibleAnswer?: string;
      isResponsible?: boolean;
      eventTypeAnswer?: string;
      nextEventAt?: string;
      audienceSizeAnswer?: string;
      estimatedAudience?: number;
      sellsOnline?: boolean;
      paidTraffic?: boolean;
      completedAt?: Date;
    },
  ) {
    return this.prisma.qualificationAnswer.upsert({
      where: { leadId },
      update: {
        conversationId,
        ...data,
      },
      create: {
        leadId,
        conversationId,
        ...data,
      },
    });
  }

  private buildOpeningMessage(leadName: string) {
    const firstName = leadName.split(' ')[0];
    return `Oi, aqui e da 77 Marketing. Encontrei o contato de ${firstName} e queria confirmar uma coisa antes de avancar: voce e a pessoa responsavel pelos eventos por ai?`;
  }

  private requiresHumanReview(content: string) {
    const lowered = content.toLowerCase();
    return [
      'quem fala',
      'nao entendi',
      'não entendi',
      'chamou errado',
      'numero errado',
    ].some((term) => lowered.includes(term));
  }

  private parseYesNo(content: string) {
    const lowered = content.toLowerCase();

    if (
      /(^|\b)(sim|sou|claro|isso|pode|com certeza|bora)(\b|$)/.test(lowered)
    ) {
      return true;
    }

    if (/(^|\b)(nao|não|negativo|nao sou|não sou)(\b|$)/.test(lowered)) {
      return false;
    }

    return null;
  }

  private extractEventType(content: string) {
    const lowered = content.toLowerCase();
    const matches = [
      'funk',
      'sertanejo',
      'universitario',
      'rodeio',
      'show',
      'sunset',
      'pagode',
    ];

    return matches.find((item) => lowered.includes(item));
  }

  private parseAudience(content: string) {
    const directNumber = content.match(/\d{2,5}/);
    if (directNumber) {
      return Number(directNumber[0]);
    }

    const lowered = content.toLowerCase();
    if (lowered.includes('pequeno')) {
      return 250;
    }
    if (lowered.includes('medio') || lowered.includes('médio')) {
      return 800;
    }
    if (lowered.includes('grande')) {
      return 1500;
    }

    return undefined;
  }

  private parseCommercialStack(content: string) {
    const lowered = content.toLowerCase();
    const yes = this.parseYesNo(content);
    const sellsOnline =
      lowered.includes('ingresso') || lowered.includes('ticket')
        ? (yes ?? true)
        : (yes ?? false);
    const paidTraffic =
      lowered.includes('trafego') ||
      lowered.includes('tráfego') ||
      lowered.includes('ads') ||
      lowered.includes('meta')
        ? (yes ?? true)
        : false;

    return {
      sellsOnline,
      paidTraffic,
    };
  }
}
