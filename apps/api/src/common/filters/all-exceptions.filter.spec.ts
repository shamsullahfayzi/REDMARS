import { ArgumentsHost, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { PrismaService } from '../../prisma/prisma.service';

describe('Sensitive error privacy', () => {
  it.each([
    '/crm/contacts',
    '/auth/change-password',
    '/users/target/reset-password',
    '/employees/target/account/reset-password',
  ])('does not store submitted values or driver arguments for %s', (path) => {
    const create = jest
      .fn<Promise<unknown>, [{ data: { path: string; stack: unknown } }]>()
      .mockResolvedValue({});
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const filter = new AllExceptionsFilter({ errorLog: { create } } as unknown as PrismaService);
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          path,
          url: `${path}?q=SensitiveName`,
          auth: { facilityId: 'f', userId: 'u' },
        }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    filter.catch(new Error('Driver failure with SensitiveName and +93700123456'), host);
    expect(JSON.stringify(create.mock.calls)).not.toMatch(/SensitiveName|93700123456/);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/SensitiveName|93700123456/);
    const written = create.mock.calls[0][0];
    expect(written.data.path).toBe(path);
    expect(written.data.stack).toBeNull();
    log.mockRestore();
  });
});
