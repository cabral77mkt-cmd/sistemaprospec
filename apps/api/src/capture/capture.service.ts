import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LeadSourceType } from '@prisma/client';
import { captureFixtures } from './capture.fixtures';
import { LeadsService, type CapturedLeadInput } from '../leads/leads.service';
import { RunCaptureDto } from './dto/run-capture.dto';

@Injectable()
export class CaptureService {
  private readonly logger = new Logger(CaptureService.name);
  private readonly eventKeywords = [
    'evento',
    'eventos',
    'show',
    'pagode',
    'sertanejo',
    'funk',
    'sunset',
    'rodeio',
    'festa',
    'label',
    'ingresso',
    'atlética',
    'atletica',
  ];

  constructor(private readonly leadsService: LeadsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDailyCapture() {
    this.logger.log('Executando captura diaria do MVP');
    await this.runCapture({
      query: 'eventos',
      sourceTypes: [
        LeadSourceType.GOOGLE_SEARCH,
        LeadSourceType.TICKETING_SITE,
        LeadSourceType.PUBLIC_REGISTRY,
      ],
    });
  }

  async runCapture(dto: RunCaptureDto) {
    const fixtureResults = this.filterFixtures(dto);
    const scrapedResults = dto.manualUrls?.length
      ? await this.scrapeManualUrls(dto.manualUrls)
      : [];
    const inputs = [...fixtureResults, ...scrapedResults];

    const summary = {
      processed: inputs.length,
      promoted: 0,
      updatedExistingLeads: 0,
      candidatesQueued: 0,
      results: [] as unknown[],
    };

    for (const input of inputs) {
      const result = await this.leadsService.upsertCapturedCandidate(input);
      summary.results.push(result);

      if ('pipelineStatus' in result) {
        if (
          'promotedFromCandidateId' in result &&
          result.promotedFromCandidateId
        ) {
          summary.promoted += 1;
        } else {
          summary.updatedExistingLeads += 1;
        }
      } else {
        summary.candidatesQueued += 1;
      }
    }

    return summary;
  }

  private filterFixtures(dto: RunCaptureDto) {
    const searchTerm = dto.query?.toLowerCase().trim();
    const selectedSources = dto.sourceTypes?.length
      ? new Set(dto.sourceTypes)
      : null;

    return captureFixtures.filter((fixture) => {
      const matchesSource =
        !selectedSources || selectedSources.has(fixture.sourceType);
      const matchesSearch =
        !searchTerm ||
        [
          fixture.displayName,
          fixture.city,
          fixture.leadCategory,
          fixture.eventType,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(searchTerm);

      return matchesSource && matchesSearch;
    });
  }

  private async scrapeManualUrls(urls: string[]): Promise<CapturedLeadInput[]> {
    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const response = await fetch(url);
          const html = await response.text();
          const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          const phoneMatch = text.match(
            /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}[-\s]?\d{4}/,
          );
          if (!phoneMatch) {
            return null;
          }

          const lowered = text.toLowerCase();
          const eventSignals = this.eventKeywords.filter((keyword) =>
            lowered.includes(keyword),
          );

          if (eventSignals.length === 0) {
            return null;
          }

          const titleMatch = html.match(/<title>(.*?)<\/title>/i);
          const hostname = new URL(url).hostname.replace(/^www\./, '');
          const displayName = titleMatch?.[1]?.trim() || hostname;

          return {
            displayName,
            rawPhone: phoneMatch[0],
            city: this.extractCity(text),
            leadCategory: 'Produtor de eventos',
            eventType: this.extractEventType(eventSignals),
            sourceType: LeadSourceType.MANUAL_WEBSITE,
            sourceLabel: hostname,
            sourceUrl: url,
            confidence: eventSignals.length >= 3 ? 84 : 72,
            eventSignals,
            payload: {
              extractedTitle: titleMatch?.[1]?.trim() ?? hostname,
            },
          } satisfies CapturedLeadInput;
        } catch (error) {
          this.logger.warn(`Falha ao capturar ${url}: ${String(error)}`);
          return null;
        }
      }),
    );

    return results.filter((value) => value !== null);
  }

  private extractCity(text: string) {
    const match = text.match(
      /\b(?:sao paulo|rio de janeiro|belo horizonte|campinas|barretos|goiania|ribeirao preto)\b/i,
    );

    return match?.[0];
  }

  private extractEventType(signals: string[]) {
    if (signals.includes('rodeio')) {
      return 'Rodeio';
    }
    if (signals.includes('sunset')) {
      return 'Sunset';
    }
    if (signals.includes('pagode')) {
      return 'Pagode';
    }
    if (signals.includes('funk')) {
      return 'Funk';
    }
    if (signals.includes('sertanejo')) {
      return 'Sertanejo';
    }

    return 'Show';
  }
}
