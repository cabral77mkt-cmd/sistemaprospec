import { LeadPipelineStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdatePipelineDto {
  @IsEnum(LeadPipelineStatus)
  status!: LeadPipelineStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
