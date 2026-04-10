import { Injectable } from '@nestjs/common';
import {
  Lead,
  LeadCandidate,
  LeadClassification,
  LeadSourceEvidence,
  QualificationAnswer,
} from '@prisma/client';

@Injectable()
export class ScoringService {
  private readonly largeOperationSignals = [
    'arena',
    'rodeio',
    'prefeitura',
    'show',
    'festival',
    'label',
  ];
  private readonly frequencySignals = [
    'agenda',
    'lote',
    'line-up',
    'evento',
    'eventos',
    'proxima edicao',
  ];

  classify(score: number): LeadClassification {
    if (score >= 70) {
      return LeadClassification.HOT;
    }

    if (score >= 40) {
      return LeadClassification.WARM;
    }

    return LeadClassification.COLD;
  }

  scoreCandidate(
    candidate: LeadCandidate,
    evidences: LeadSourceEvidence[],
    qualification?: QualificationAnswer | null,
  ) {
    return this.buildScore({
      phoneConfidence: candidate.confidence,
      hasInstagram: Boolean(candidate.instagram),
      hasEventEvidence: candidate.hasEventEvidence,
      leadCategory: candidate.leadCategory,
      eventType: candidate.eventType,
      evidences,
      qualification,
    });
  }

  scoreLead(
    lead: Lead,
    evidences: LeadSourceEvidence[],
    qualification?: QualificationAnswer | null,
  ) {
    return this.buildScore({
      phoneConfidence: lead.sourceConfidence,
      hasInstagram: Boolean(lead.instagram),
      hasEventEvidence: evidences.length > 0,
      leadCategory: lead.leadCategory,
      eventType: lead.eventType,
      evidences,
      qualification,
    });
  }

  private buildScore({
    phoneConfidence,
    hasInstagram,
    hasEventEvidence,
    leadCategory,
    eventType,
    evidences,
    qualification,
  }: {
    phoneConfidence: number;
    hasInstagram: boolean;
    hasEventEvidence: boolean;
    leadCategory?: string | null;
    eventType?: string | null;
    evidences: LeadSourceEvidence[];
    qualification?: QualificationAnswer | null;
  }) {
    const eventSignals = evidences.flatMap((evidence) => {
      const rawSignals = Array.isArray(evidence.eventSignals)
        ? evidence.eventSignals
        : [];
      return rawSignals
        .filter((signal): signal is string => typeof signal === 'string')
        .map((signal) => signal.toLowerCase());
    });
    const signalText = [leadCategory, eventType, ...eventSignals]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const evidenceDiversity = new Set(
      evidences.map((evidence) => evidence.sourceType),
    ).size;

    const breakdown = {
      whatsappConfidence:
        phoneConfidence >= 85
          ? 25
          : phoneConfidence >= 70
            ? 18
            : phoneConfidence >= 50
              ? 10
              : 0,
      instagramPresence: hasInstagram ? 10 : 0,
      eventEvidence: hasEventEvidence ? 20 : 0,
      digitalPresence: hasInstagram || evidenceDiversity > 1 ? 15 : 0,
      frequencySignal: this.hasSignal(signalText, this.frequencySignals)
        ? 10
        : 0,
      professionalCommunication:
        phoneConfidence >= 75 &&
        (leadCategory || eventType || evidenceDiversity > 0)
          ? 10
          : 0,
      largeOperation:
        this.hasSignal(signalText, this.largeOperationSignals) ||
        (qualification?.estimatedAudience ?? 0) >= 1000
          ? 10
          : 0,
      qualificationLift: this.getQualificationLift(qualification),
    };

    const totalScore = Math.min(
      100,
      Object.values(breakdown).reduce((sum, value) => sum + value, 0),
    );

    return {
      totalScore,
      classification: this.classify(totalScore),
      breakdown,
    };
  }

  private hasSignal(text: string, signals: string[]) {
    return signals.some((signal) => text.includes(signal));
  }

  private getQualificationLift(qualification?: QualificationAnswer | null) {
    if (!qualification) {
      return 0;
    }

    let lift = 0;

    if (qualification.isResponsible) {
      lift += 5;
    }

    if (qualification.sellsOnline) {
      lift += 3;
    }

    if (qualification.paidTraffic) {
      lift += 2;
    }

    return lift;
  }
}
