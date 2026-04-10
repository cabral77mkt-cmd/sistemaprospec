import {
  LeadClassification,
  LeadPipelineStatus,
  LeadSourceType,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class ListLeadsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(LeadClassification)
  classification?: LeadClassification;

  @IsOptional()
  @IsEnum(LeadPipelineStatus)
  pipelineStatus?: LeadPipelineStatus;

  @IsOptional()
  @IsEnum(LeadSourceType)
  sourceType?: LeadSourceType;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyNoContact?: boolean;
}
