import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Request,
} from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { AddMemberDto } from './dto/add-member.dto';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private workspacesService: WorkspacesService) {}

  @Post()
  async create(@Body() dto: CreateWorkspaceDto, @Request() req: any) {
    return this.workspacesService.create(dto.name, req.user.id);
  }

  @Get()
  async findAll(@Request() req: any) {
    return this.workspacesService.findAllForUser(req.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    const workspace = await this.workspacesService.findById(id);
    await this.workspacesService.assertMembership(id, req.user.id);
    return workspace;
  }

  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @Request() req: any,
  ) {
    return this.workspacesService.addMember(id, dto.email, dto.role || 'MEMBER', req.user.id);
  }
}
