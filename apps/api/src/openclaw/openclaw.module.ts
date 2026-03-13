import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from '../chat/chat.module';
import { OpenclawGatewayService } from './openclaw-gateway.service';
import { OpenclawAgentService } from './openclaw-agent.service';
import { OpenclawBridgeService } from './openclaw-bridge.service';
import { OpenclawController } from './openclaw.controller';

@Module({
  imports: [ConfigModule, ChatModule],
  providers: [OpenclawGatewayService, OpenclawAgentService, OpenclawBridgeService],
  controllers: [OpenclawController],
  exports: [OpenclawAgentService, OpenclawGatewayService],
})
export class OpenclawModule {}
