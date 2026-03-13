import { IsEmail, IsOptional, IsIn } from 'class-validator';

export class AddMemberDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsIn(['ADMIN', 'MEMBER'])
  role?: string = 'MEMBER';
}
