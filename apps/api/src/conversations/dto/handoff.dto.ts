import { IsOptional, IsString } from 'class-validator';

export class HandoffDto {
  @IsOptional()
  @IsString()
  note?: string;
}
