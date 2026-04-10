import { LeadSourceType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class RunCaptureDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  manualUrls?: string[];

  @IsOptional()
  @Transform(({ value }): string[] | undefined => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value.filter(
        (item): item is string => typeof item === 'string' && item.length > 0,
      );
    }

    return typeof value === 'string' ? [value] : undefined;
  })
  @IsArray()
  @IsEnum(LeadSourceType, { each: true })
  sourceTypes?: LeadSourceType[];
}
