import { Injectable } from '@nestjs/common';
import { LeadClassification, LeadPipelineStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics() {
    const today = new Date();
    const startOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );

    const [
      newLeadsToday,
      leadsWithoutContact,
      scoreGroups,
      activeConversations,
      handoffCount,
      sourceEvidence,
      allLeads,
      conversations,
      recentTransitions,
      candidatesInQueue,
      session,
    ] = await Promise.all([
      this.prisma.lead.count({
        where: {
          createdAt: {
            gte: startOfDay,
          },
        },
      }),
      this.prisma.lead.count({
        where: {
          pipelineStatus: {
            in: [
              LeadPipelineStatus.LEAD_FOUND,
              LeadPipelineStatus.LEAD_QUALIFIED,
            ],
          },
        },
      }),
      this.prisma.lead.groupBy({
        by: ['classification'],
        _count: { classification: true },
      }),
      this.prisma.conversation.count({
        where: {
          status: {
            in: ['ACTIVE', 'NEEDS_REVIEW'],
          },
        },
      }),
      this.prisma.lead.count({
        where: {
          pipelineStatus: LeadPipelineStatus.MEETING_HANDOFF,
        },
      }),
      this.prisma.leadSourceEvidence.groupBy({
        by: ['sourceType'],
        _count: { sourceType: true },
      }),
      this.prisma.lead.findMany({
        select: {
          leadCategory: true,
          pipelineStatus: true,
          classification: true,
        },
      }),
      this.prisma.conversation.findMany({
        select: {
          id: true,
          meetingRequested: true,
          messages: {
            select: {
              direction: true,
            },
          },
        },
      }),
      this.prisma.pipelineTransition.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          lead: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.leadCandidate.count({
        where: { status: 'NEW' },
      }),
      this.prisma.whatsAppSession.findFirst({
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const scoreMap = {
      HOT: 0,
      WARM: 0,
      COLD: 0,
    };

    for (const group of scoreGroups) {
      scoreMap[group.classification] = group._count.classification;
    }

    const byCategory = allLeads.reduce<Record<string, number>>(
      (accumulator, lead) => {
        const key = lead.leadCategory ?? 'Nao classificado';
        accumulator[key] = (accumulator[key] ?? 0) + 1;
        return accumulator;
      },
      {},
    );

    const byPipeline = allLeads.reduce<Record<string, number>>(
      (accumulator, lead) => {
        accumulator[lead.pipelineStatus] =
          (accumulator[lead.pipelineStatus] ?? 0) + 1;
        return accumulator;
      },
      {},
    );

    const responseEligible = conversations.length;
    const repliedConversations = conversations.filter((conversation) =>
      conversation.messages.some((message) => message.direction === 'INBOUND'),
    ).length;
    const scheduledConversations = conversations.filter(
      (conversation) => conversation.meetingRequested,
    ).length;

    return {
      kpis: {
        newLeadsToday,
        leadsWithoutContact,
        activeConversations,
        candidatesInQueue,
        handoffCount,
        responseRate: responseEligible
          ? Number(((repliedConversations / responseEligible) * 100).toFixed(1))
          : 0,
        schedulingRate: responseEligible
          ? Number(
              ((scheduledConversations / responseEligible) * 100).toFixed(1),
            )
          : 0,
      },
      scoreBuckets: [
        {
          label: 'Quente',
          value: scoreMap[LeadClassification.HOT],
        },
        {
          label: 'Morno',
          value: scoreMap[LeadClassification.WARM],
        },
        {
          label: 'Frio',
          value: scoreMap[LeadClassification.COLD],
        },
      ],
      sourceBreakdown: sourceEvidence.map((source) => ({
        sourceType: source.sourceType,
        count: source._count.sourceType,
      })),
      categoryBreakdown: Object.entries(byCategory).map(
        ([category, count]) => ({
          category,
          count,
        }),
      ),
      pipelineBreakdown: Object.entries(byPipeline).map(([status, count]) => ({
        status,
        count,
      })),
      recentTransitions,
      whatsapp: session,
    };
  }
}
