import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LeadClassification,
  LeadPipelineStatus,
  LeadSourceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
  ) {}

  async listLeads(query: ListLeadsQueryDto) {
    const where: Prisma.LeadWhereInput = {
      classification: query.classification,
      pipelineStatus: query.pipelineStatus,
      city: query.city
        ? {
            contains: query.city,
          }
        : undefined,
      evidences: query.sourceType
        ? {
            some: {
              sourceType: query.sourceType,
            },
          }
        : undefined,
      OR: query.search
        ? [
            { name: { contains: query.search } },
            { city: { contains: query.search } },
            { whatsapp: { contains: this.normalizePhone(query.search) } },
            { instagram: { contains: query.search } },
          ]
        : undefined,
    };

    if (query.onlyNoContact) {
      where.pipelineStatus = {
        in: [LeadPipelineStatus.LEAD_FOUND, LeadPipelineStatus.LEAD_QUALIFIED],
      };
    }

    const leads = await this.prisma.lead.findMany({
      where,
      include: {
        evidences: true,
        qualification: true,
        conversations: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          include: {
            messages: {
              orderBy: { sentAt: 'desc' },
              take: 1,
            },
          },
        },
        scoreSnapshots: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    });

    return leads.map((lead) => ({
      ...lead,
      sourceCount: lead.evidences.length,
      latestScoreBreakdown: lead.scoreSnapshots[0]?.breakdown ?? null,
      latestMessagePreview: lead.conversations[0]?.messages[0]?.content ?? null,
      hasConversation: lead.conversations.length > 0,
    }));
  }

  async listCandidates() {
    const candidates = await this.prisma.leadCandidate.findMany({
      where: { status: 'NEW' },
      include: { evidences: true },
      orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
    });

    return candidates;
  }

  async upsertCapturedCandidate(input: CapturedLeadInput) {
    const normalizedPhone = this.normalizePhone(
      input.rawPhone ?? input.whatsapp ?? '',
    );
    const confidence = input.confidence ?? 0;

    if (!normalizedPhone) {
      throw new BadRequestException(
        'Lead capturado sem telefone/WhatsApp valido.',
      );
    }

    const existingLead = await this.findMatchingLead({
      normalizedPhone,
      cnpj: input.cnpj,
      displayName: input.displayName,
      city: input.city,
    });

    if (existingLead) {
      await this.attachEvidenceToLead(existingLead.id, {
        sourceLabel: input.sourceLabel,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl,
        confidence,
        phoneFound: input.rawPhone ?? input.whatsapp,
        eventSignals: input.eventSignals,
        payload: input.payload,
        isPrimary: false,
      });

      await this.prisma.lead.update({
        where: { id: existingLead.id },
        data: {
          sourceConfidence: Math.max(existingLead.sourceConfidence, confidence),
          instagram: existingLead.instagram ?? input.instagram,
          cnpj: existingLead.cnpj ?? input.cnpj,
          city: existingLead.city ?? input.city,
          state: existingLead.state ?? input.state,
          leadCategory: existingLead.leadCategory ?? input.leadCategory,
          eventType: existingLead.eventType ?? input.eventType,
        },
      });

      return this.refreshLeadScore(existingLead.id);
    }

    const existingCandidate = await this.findMatchingCandidate({
      normalizedPhone,
      cnpj: input.cnpj,
      displayName: input.displayName,
      city: input.city,
    });

    const candidate = existingCandidate
      ? await this.prisma.leadCandidate.update({
          where: { id: existingCandidate.id },
          data: {
            displayName: input.displayName,
            normalizedPhone,
            rawPhone: input.rawPhone ?? input.whatsapp,
            instagram: existingCandidate.instagram ?? input.instagram,
            cnpj: existingCandidate.cnpj ?? input.cnpj,
            city: existingCandidate.city ?? input.city,
            state: existingCandidate.state ?? input.state,
            leadCategory: existingCandidate.leadCategory ?? input.leadCategory,
            eventType: existingCandidate.eventType ?? input.eventType,
            sourceSummary: input.sourceLabel,
            evidenceSummary: input.eventSignals.join(', '),
            confidence: Math.max(existingCandidate.confidence, confidence),
            hasEventEvidence:
              existingCandidate.hasEventEvidence ||
              input.eventSignals.length > 0,
            metadata: input.payload ?? Prisma.JsonNull,
          },
        })
      : await this.prisma.leadCandidate.create({
          data: {
            displayName: input.displayName,
            normalizedPhone,
            rawPhone: input.rawPhone ?? input.whatsapp,
            instagram: input.instagram,
            cnpj: input.cnpj,
            city: input.city,
            state: input.state,
            leadCategory: input.leadCategory,
            eventType: input.eventType,
            sourceSummary: input.sourceLabel,
            evidenceSummary: input.eventSignals.join(', '),
            confidence,
            hasEventEvidence: input.eventSignals.length > 0,
            metadata: input.payload ?? Prisma.JsonNull,
          },
        });

    await this.prisma.leadSourceEvidence.create({
      data: {
        candidateId: candidate.id,
        sourceType: input.sourceType,
        sourceLabel: input.sourceLabel,
        sourceUrl: input.sourceUrl,
        confidence,
        phoneFound: input.rawPhone ?? input.whatsapp,
        eventSignals: input.eventSignals,
        payload: input.payload ?? Prisma.JsonNull,
        isPrimary: true,
      },
    });

    if (this.isPromotable(candidate, confidence)) {
      return this.promoteCandidate(candidate.id);
    }

    return this.prisma.leadCandidate.findUniqueOrThrow({
      where: { id: candidate.id },
      include: { evidences: true },
    });
  }

  async promoteCandidate(candidateId: string, performedById?: string) {
    const candidate = await this.prisma.leadCandidate.findUnique({
      where: { id: candidateId },
      include: { evidences: true },
    });

    if (!candidate) {
      throw new NotFoundException('Lead candidato nao encontrado.');
    }

    if (
      !candidate.normalizedPhone ||
      !candidate.hasEventEvidence ||
      candidate.confidence < 70
    ) {
      throw new BadRequestException(
        'Esse candidato ainda nao tem confianca suficiente para virar lead operacional.',
      );
    }

    const matchingLead = await this.findMatchingLead({
      normalizedPhone: candidate.normalizedPhone,
      cnpj: candidate.cnpj,
      displayName: candidate.displayName,
      city: candidate.city,
    });

    if (matchingLead) {
      await this.prisma.leadCandidate.update({
        where: { id: candidate.id },
        data: { status: 'PROMOTED' },
      });
      await this.prisma.leadSourceEvidence.updateMany({
        where: { candidateId: candidate.id },
        data: { leadId: matchingLead.id },
      });

      return this.refreshLeadScore(matchingLead.id);
    }

    const score = this.scoringService.scoreCandidate(
      candidate,
      candidate.evidences,
    );

    const lead = await this.prisma.lead.create({
      data: {
        name: candidate.displayName,
        normalizedPhone: candidate.normalizedPhone,
        rawPhone: candidate.rawPhone ?? candidate.normalizedPhone,
        whatsapp: candidate.normalizedPhone,
        instagram: candidate.instagram,
        cnpj: candidate.cnpj,
        city: candidate.city,
        state: candidate.state,
        leadCategory: candidate.leadCategory,
        eventType: candidate.eventType,
        originPrimary:
          candidate.evidences[0]?.sourceType ?? LeadSourceType.OTHER,
        score: score.totalScore,
        classification: score.classification,
        pipelineStatus:
          score.classification === LeadClassification.COLD
            ? LeadPipelineStatus.LEAD_FOUND
            : LeadPipelineStatus.LEAD_QUALIFIED,
        sourceConfidence: candidate.confidence,
        promotedFromCandidateId: candidate.id,
        notes:
          candidate.evidenceSummary ?? candidate.sourceSummary ?? undefined,
        scoreSnapshots: {
          create: {
            totalScore: score.totalScore,
            classification: score.classification,
            breakdown: score.breakdown,
          },
        },
        pipelineTransitions: {
          create: {
            fromStatus: null,
            toStatus:
              score.classification === LeadClassification.COLD
                ? LeadPipelineStatus.LEAD_FOUND
                : LeadPipelineStatus.LEAD_QUALIFIED,
            reason: 'Promovido automaticamente a partir da captacao',
            performedById,
          },
        },
      },
      include: {
        evidences: true,
        qualification: true,
      },
    });

    await this.prisma.leadSourceEvidence.updateMany({
      where: { candidateId: candidate.id },
      data: { leadId: lead.id },
    });

    await this.prisma.leadCandidate.update({
      where: { id: candidate.id },
      data: { status: 'PROMOTED' },
    });

    return this.prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      include: {
        evidences: true,
        qualification: true,
        conversations: true,
        scoreSnapshots: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async updatePipeline(
    leadId: string,
    status: LeadPipelineStatus,
    reason?: string,
    performedById?: string,
  ) {
    const currentLead = await this.prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!currentLead) {
      throw new NotFoundException('Lead nao encontrado.');
    }

    const lead = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        pipelineStatus: status,
        pipelineTransitions: {
          create: {
            fromStatus: currentLead.pipelineStatus,
            toStatus: status,
            reason,
            performedById,
          },
        },
      },
      include: {
        evidences: true,
        qualification: true,
      },
    });

    return lead;
  }

  async getPipelineBoard() {
    const leads = await this.prisma.lead.findMany({
      include: {
        evidences: true,
        conversations: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
    });

    return Object.values(LeadPipelineStatus).map((status) => ({
      status,
      leads: leads.filter((lead) => lead.pipelineStatus === status),
    }));
  }

  async refreshLeadScore(leadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        evidences: true,
        qualification: true,
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead nao encontrado.');
    }

    const score = this.scoringService.scoreLead(
      lead,
      lead.evidences,
      lead.qualification,
    );

    await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        score: score.totalScore,
        classification: score.classification,
        scoreSnapshots: {
          create: {
            totalScore: score.totalScore,
            classification: score.classification,
            breakdown: score.breakdown,
          },
        },
      },
    });

    return this.prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      include: {
        evidences: true,
        qualification: true,
        conversations: true,
        scoreSnapshots: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  private async attachEvidenceToLead(
    leadId: string,
    evidence: {
      sourceType: LeadSourceType;
      sourceLabel: string;
      sourceUrl?: string;
      confidence: number;
      phoneFound?: string;
      eventSignals: string[];
      payload?: Prisma.InputJsonValue;
      isPrimary: boolean;
    },
  ) {
    return this.prisma.leadSourceEvidence.create({
      data: {
        leadId,
        sourceType: evidence.sourceType,
        sourceLabel: evidence.sourceLabel,
        sourceUrl: evidence.sourceUrl,
        confidence: evidence.confidence,
        phoneFound: evidence.phoneFound,
        eventSignals: evidence.eventSignals,
        payload: evidence.payload ?? Prisma.JsonNull,
        isPrimary: evidence.isPrimary,
      },
    });
  }

  private async findMatchingLead(params: {
    normalizedPhone?: string | null;
    cnpj?: string | null;
    displayName?: string | null;
    city?: string | null;
  }) {
    const { normalizedPhone, cnpj, displayName, city } = params;

    const whereClauses: Prisma.LeadWhereInput[] = [];

    if (normalizedPhone) {
      whereClauses.push({ normalizedPhone });
    }

    if (cnpj) {
      whereClauses.push({ cnpj });
    }

    if (displayName && city) {
      whereClauses.push({
        name: { equals: displayName },
        city: { equals: city },
      });
    }

    if (whereClauses.length === 0) {
      return null;
    }

    return this.prisma.lead.findFirst({
      where: {
        OR: whereClauses,
      },
    });
  }

  private async findMatchingCandidate(params: {
    normalizedPhone?: string | null;
    cnpj?: string | null;
    displayName?: string | null;
    city?: string | null;
  }) {
    const { normalizedPhone, cnpj, displayName, city } = params;

    const whereClauses: Prisma.LeadCandidateWhereInput[] = [];

    if (normalizedPhone) {
      whereClauses.push({ normalizedPhone });
    }

    if (cnpj) {
      whereClauses.push({ cnpj });
    }

    if (displayName && city) {
      whereClauses.push({
        displayName: { equals: displayName },
        city: { equals: city },
      });
    }

    if (whereClauses.length === 0) {
      return null;
    }

    return this.prisma.leadCandidate.findFirst({
      where: {
        status: { not: 'REJECTED' },
        OR: whereClauses,
      },
    });
  }

  private isPromotable(
    candidate: { hasEventEvidence: boolean },
    confidence: number,
  ) {
    return candidate.hasEventEvidence && confidence >= 70;
  }

  private normalizePhone(value?: string | null) {
    if (!value) {
      return '';
    }

    const digits = value.replace(/\D/g, '');

    if (!digits) {
      return '';
    }

    if (digits.startsWith('55')) {
      return digits;
    }

    if (digits.length >= 10 && digits.length <= 11) {
      return `55${digits}`;
    }

    return digits;
  }
}

export type CapturedLeadInput = {
  displayName: string;
  rawPhone?: string;
  whatsapp?: string;
  instagram?: string;
  cnpj?: string;
  city?: string;
  state?: string;
  leadCategory?: string;
  eventType?: string;
  sourceType: LeadSourceType;
  sourceLabel: string;
  sourceUrl?: string;
  confidence?: number;
  eventSignals: string[];
  payload?: Prisma.InputJsonValue;
};
