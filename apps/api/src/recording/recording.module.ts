import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RecordingService } from './recording.service';
import { RecordingController } from './recording.controller';
import { StorageService } from './storage/storage.service';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [ConfigModule, RoomsModule],
  providers: [RecordingService, StorageService],
  controllers: [RecordingController],
})
export class RecordingModule {}
