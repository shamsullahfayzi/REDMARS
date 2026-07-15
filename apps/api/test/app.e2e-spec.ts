import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { HealthResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

// Needs a reachable database — run `pnpm db:up` first.
describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET) reports ok while the database is reachable', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as HealthResponse;
        expect(body.status).toBe('ok');
        expect(body.database).toBe('up');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
