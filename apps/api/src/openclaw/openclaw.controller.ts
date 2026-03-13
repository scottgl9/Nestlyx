import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OpenclawAgentService } from './openclaw-agent.service';
import { OpenclawGatewayService } from './openclaw-gateway.service';
import { CreateAgentDto, AssignAgentDto } from '@nestlyx/shared';

@Controller('openclaw')
export class OpenclawController {
  constructor(
    private agentService: OpenclawAgentService,
    private gatewayService: OpenclawGatewayService,
  ) {}

  @Post('agents')
  async createAgent(@Body() dto: CreateAgentDto) {
    return this.agentService.createAgent(dto);
  }

  @Get('agents')
  async listAgents() {
    return this.agentService.listAgents();
  }

  @Delete('agents/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAgent(@Param('id') id: string) {
    await this.agentService.deleteAgent(id);
  }

  @Post('agents/:id/assign')
  async assignAgent(@Param('id') id: string, @Body() dto: AssignAgentDto) {
    return this.agentService.assignToWorkspace(id, dto);
  }

  @Delete('agents/:id/assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAssignment(
    @Param('id') id: string,
    @Body() body: { workspaceId: string; roomId?: string },
  ) {
    await this.agentService.removeAssignment(id, body.workspaceId, body.roomId);
  }

  @Get('status')
  getStatus() {
    return {
      connected: this.gatewayService.isConnected(),
    };
  }
}
