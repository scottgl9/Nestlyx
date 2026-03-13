import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { v4 as uuid } from 'uuid';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface AgentPending {
  resolve: (output: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

@Injectable()
export class OpenclawGatewayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpenclawGatewayService.name);
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private pendingAgents = new Map<string, AgentPending>();
  private reconnectDelay = 5000;
  private maxReconnectDelay = 60000;
  private lastTick = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private connected = false;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('OPENCLAW_GATEWAY_URL');
    if (url) {
      this.connect();
    } else {
      this.logger.warn('OPENCLAW_GATEWAY_URL not configured — agent integration disabled');
    }
  }

  onModuleDestroy() {
    this.destroyed = true;
    this.cleanup();
  }

  isConnected(): boolean {
    return this.connected;
  }

  private connect() {
    const url = this.config.get<string>('OPENCLAW_GATEWAY_URL');
    if (!url || this.destroyed) return;

    try {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.logger.log(`Connected to OpenClaw gateway at ${url}`);
        this.reconnectDelay = 5000;
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const frame = JSON.parse(data.toString());
          this.handleFrame(frame);
        } catch (err) {
          this.logger.error(`Failed to parse gateway frame: ${err}`);
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.logger.warn('OpenClaw gateway connection closed');
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        this.logger.error(`OpenClaw gateway error: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.error(`Failed to connect to OpenClaw gateway: ${err.message}`);
      this.scheduleReconnect();
    }
  }

  private handleFrame(frame: any) {
    switch (frame.type) {
      case 'connect.challenge':
        this.handleChallenge(frame);
        break;
      case 'res':
        this.handleResponse(frame);
        break;
      case 'agent':
        this.handleAgentEvent(frame);
        break;
      case 'tick':
        this.lastTick = Date.now();
        break;
      default:
        break;
    }
  }

  private handleChallenge(frame: any) {
    const token = this.config.get<string>('OPENCLAW_AUTH_TOKEN', '');
    this.send({
      type: 'connect',
      token,
      protocol: 3,
      scopes: ['operator.write'],
    });
    this.connected = true;
    this.lastTick = Date.now();
    this.startHeartbeatMonitor();
  }

  private handleResponse(frame: any) {
    const { id, data, error } = frame;
    const pending = this.pendingRequests.get(id);
    if (!pending) return;

    this.pendingRequests.delete(id);
    clearTimeout(pending.timer);

    if (error) {
      pending.reject(new Error(error.message || 'Gateway request failed'));
    } else if (data?.accepted && data?.agentRequestId) {
      // Two-phase: request accepted, now wait for agent event
      const agentId = data.agentRequestId;
      const agentTimeout = setTimeout(() => {
        this.pendingAgents.delete(agentId);
        pending.reject(new Error('Agent invocation timed out'));
      }, 120000);
      this.pendingAgents.set(agentId, {
        resolve: pending.resolve,
        reject: pending.reject,
        timer: agentTimeout,
      });
    } else {
      pending.resolve(data);
    }
  }

  private handleAgentEvent(frame: any) {
    const { agentRequestId, done, output, error } = frame;
    const pending = this.pendingAgents.get(agentRequestId);
    if (!pending) return;

    if (done || error) {
      this.pendingAgents.delete(agentRequestId);
      clearTimeout(pending.timer);
      if (error) {
        pending.reject(new Error(error.message || 'Agent error'));
      } else {
        pending.resolve(output || '');
      }
    }
  }

  private send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private startHeartbeatMonitor() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastTick > 60000) {
        this.logger.warn('Heartbeat timeout — reconnecting');
        this.ws?.close();
      }
    }, 30000);
  }

  private scheduleReconnect() {
    if (this.destroyed) return;
    this.cleanup();
    this.reconnectTimer = setTimeout(() => {
      this.logger.log(`Reconnecting to OpenClaw gateway (delay: ${this.reconnectDelay}ms)`);
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }

  private cleanup() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.connected = false;
  }

  async invokeAgent(
    agentName: string,
    input: string,
    sessionKey: string,
  ): Promise<string> {
    if (!this.connected) {
      throw new Error('OpenClaw gateway not connected');
    }

    const id = uuid();
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Gateway request timed out'));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timer });

      this.send({
        type: 'req',
        id,
        method: 'node.invoke',
        params: {
          agent: agentName,
          input,
          session: sessionKey,
        },
      });
    });
  }
}
