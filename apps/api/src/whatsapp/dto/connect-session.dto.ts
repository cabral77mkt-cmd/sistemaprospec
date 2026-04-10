import { IsOptional, IsString } from 'class-validator';

export class ConnectSessionDto {
  @IsOptional()
  @IsString()
  label?: string;
}
