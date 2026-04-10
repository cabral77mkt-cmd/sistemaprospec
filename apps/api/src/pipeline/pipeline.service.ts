import { Injectable } from '@nestjs/common';
import { LeadPipelineStatus } from '@prisma/client';
import { LeadsService } from '../leads/leads.service';

@Injectable()
export class PipelineService {
  constructor(private readonly leadsService: LeadsService) {}

  getBoard() {
    return this.leadsService.getPipelineBoard();
  }

  updateLeadStatus(
    leadId: string,
    status: LeadPipelineStatus,
    reason?: string,
    performedById?: string,
  ) {
    return this.leadsService.updatePipeline(
      leadId,
      status,
      reason,
      performedById,
    );
  }
}
