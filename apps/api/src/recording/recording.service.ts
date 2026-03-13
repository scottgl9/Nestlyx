import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage/storage.service';

@Injectable()
export class RecordingService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async startRecording(roomId: string, userId: string) {
    return this.prisma.recording.create({
      data: {
        roomId,
        userId,
        status: 'RECORDING',
      },
    });
  }

  async stopRecording(id: string) {
    const recording = await this.prisma.recording.findUnique({ where: { id } });
    if (!recording) throw new NotFoundException('Recording not found');

    return this.prisma.recording.update({
      where: { id },
      data: { status: 'STOPPED' },
    });
  }

  async uploadRecording(id: string, file: Express.Multer.File) {
    const recording = await this.prisma.recording.findUnique({ where: { id } });
    if (!recording) throw new NotFoundException('Recording not found');

    const filename = `recordings/${recording.roomId}/${id}.webm`;
    const filePath = await this.storage.save(filename, file.buffer);

    return this.prisma.recording.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        filePath,
        fileSize: file.size,
      },
    });
  }

  async listByRoom(roomId: string) {
    return this.prisma.recording.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const recording = await this.prisma.recording.findUnique({ where: { id } });
    if (!recording) throw new NotFoundException('Recording not found');
    return recording;
  }
}
