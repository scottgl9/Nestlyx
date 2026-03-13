import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export interface StorageProvider {
  save(filename: string, data: Buffer): Promise<string>;
  getFilePath(filename: string): string;
  exists(filename: string): Promise<boolean>;
}

@Injectable()
export class StorageService implements StorageProvider {
  private basePath: string;

  constructor(private config: ConfigService) {
    this.basePath = config.get<string>('STORAGE_LOCAL_PATH', './uploads');
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  async save(filename: string, data: Buffer): Promise<string> {
    const filePath = path.join(this.basePath, filename);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, data);
    return filePath;
  }

  getFilePath(filename: string): string {
    return path.join(this.basePath, filename);
  }

  async exists(filename: string): Promise<boolean> {
    return fs.existsSync(path.join(this.basePath, filename));
  }
}
