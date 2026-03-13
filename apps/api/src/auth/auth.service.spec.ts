import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: any;
  let jwtService: any;

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('test-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should create a user and return token', async () => {
      usersService.findByEmail!.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      usersService.create!.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        displayName: 'Test User',
        passwordHash: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.register('test@test.com', 'password123', 'Test User');

      expect(result.accessToken).toBe('test-token');
      expect(result.user.email).toBe('test@test.com');
      expect(usersService.create).toHaveBeenCalledWith({
        email: 'test@test.com',
        displayName: 'Test User',
        passwordHash: 'hashed-password',
      });
    });

    it('should throw ConflictException if email exists', async () => {
      usersService.findByEmail!.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        displayName: 'Test',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.register('test@test.com', 'password123', 'Test'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return token for valid credentials', async () => {
      usersService.findByEmail!.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        displayName: 'Test',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login('test@test.com', 'password123');

      expect(result.accessToken).toBe('test-token');
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      usersService.findByEmail!.mockResolvedValue(null);

      await expect(
        service.login('test@test.com', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateUser', () => {
    it('should return user for valid credentials', async () => {
      const user = {
        id: '1',
        email: 'test@test.com',
        displayName: 'Test',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersService.findByEmail!.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@test.com', 'password123');
      expect(result).toEqual(user);
    });

    it('should return null for invalid password', async () => {
      usersService.findByEmail!.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        displayName: 'Test',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser('test@test.com', 'wrong');
      expect(result).toBeNull();
    });
  });
});
