import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  // In-memory user store for mocking
  const users: Record<string, { id: string; email: string; displayName: string; passwordHash: string; createdAt: Date; updatedAt: Date }> = {};

  const mockPrismaService = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: {
      create: jest.fn().mockImplementation(({ data }) => {
        const id = `mock-id-${Date.now()}`;
        const user = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
        users[id] = user;
        users[`email:${data.email}`] = user;
        return Promise.resolve(user);
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.email) {
          return Promise.resolve(users[`email:${where.email}`] ?? null);
        }
        if (where.id) {
          return Promise.resolve(users[where.id] ?? null);
        }
        return Promise.resolve(null);
      }),
    },
    workspace: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    workspaceMember: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    room: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    participant: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    chatMessage: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    recording: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    meetingEvent: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const testUser = {
    email: 'test@example.com',
    password: 'password123',
    displayName: 'Test User',
  };

  describe('POST /auth/register', () => {
    it('should register a new user and return 201 with a token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.displayName).toBe(testUser.displayName);

      accessToken = response.body.accessToken;
    });

    it('should return 409 if email already registered', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials and return a token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body.user.email).toBe(testUser.email);

      accessToken = response.body.accessToken;
    });

    it('should return 401 with invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testUser.email, password: 'wrongpassword' })
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    it('should return the current user with displayName when authenticated', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe(testUser.email);
      expect(response.body.displayName).toBe(testUser.displayName);
    });

    it('should return 401 when no token provided', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
    });
  });
});
