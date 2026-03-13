import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Request,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { Public } from '../auth/decorators/public.decorator';

@Controller()
export class RoomsController {
  constructor(
    private roomsService: RoomsService,
    private workspacesService: WorkspacesService,
  ) {}

  @Post('workspaces/:wid/rooms')
  async create(
    @Param('wid') wid: string,
    @Body() dto: CreateRoomDto,
    @Request() req: any,
  ) {
    await this.workspacesService.assertMembership(wid, req.user.id);
    return this.roomsService.create(wid, dto.name, req.user.id);
  }

  @Get('workspaces/:wid/rooms')
  async findByWorkspace(@Param('wid') wid: string, @Request() req: any) {
    await this.workspacesService.assertMembership(wid, req.user.id);
    return this.roomsService.findByWorkspace(wid);
  }

  @Get('rooms/:id')
  async findOne(@Param('id') id: string) {
    return this.roomsService.findById(id);
  }

  @Post('rooms/:id/join')
  async join(@Param('id') id: string, @Request() req: any) {
    return this.roomsService.join(id, req.user.id, 'GUEST');
  }

  @Post('rooms/:id/leave')
  async leave(@Param('id') id: string, @Request() req: any) {
    return this.roomsService.leave(id, req.user.id);
  }

  @Public()
  @Get('rooms/invite/:code')
  async findByInviteCode(@Param('code') code: string) {
    return this.roomsService.findByInviteCode(code);
  }
}
