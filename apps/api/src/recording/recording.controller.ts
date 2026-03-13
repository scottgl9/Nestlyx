import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Request,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import { RecordingService } from './recording.service';

@Controller('recordings')
export class RecordingController {
  constructor(private recordingService: RecordingService) {}

  @Post('start/:roomId')
  async start(@Param('roomId') roomId: string, @Request() req: any) {
    return this.recordingService.startRecording(roomId, req.user.id);
  }

  @Post(':id/stop')
  async stop(@Param('id') id: string) {
    return this.recordingService.stopRecording(id);
  }

  @Post(':id/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  async upload(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.recordingService.uploadRecording(id, file);
  }

  @Post(':id/upload-speaker-track')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  async uploadSpeakerTrack(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { userId: string; speakerName: string },
  ) {
    return this.recordingService.uploadSpeakerTrack(
      id,
      file,
      body.userId,
      body.speakerName,
    );
  }

  @Get('room/:roomId')
  async listByRoom(@Param('roomId') roomId: string) {
    return this.recordingService.listByRoom(roomId);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const recording = await this.recordingService.findById(id);
    if (!recording.filePath || !fs.existsSync(recording.filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }
    return res.download(recording.filePath);
  }
}
