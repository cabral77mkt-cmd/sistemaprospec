import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class StartCampaignDto {
  @IsArray()
  @IsString({ each: true })
  leadIds!: string[];

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  dailyLimit?: number;

  @IsOptional()
  @IsBoolean()
  overrideDailyLimit?: boolean;

  @IsOptional()
  @IsString()
  windowStart?: string;

  @IsOptional()
  @IsString()
  windowEnd?: string;
}
