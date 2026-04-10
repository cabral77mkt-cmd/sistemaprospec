import { IsOptional, IsString } from 'class-validator';

export class SimulateInboundDto {
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  receivedAt?: string;
}
