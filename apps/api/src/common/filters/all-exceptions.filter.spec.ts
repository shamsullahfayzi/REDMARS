import { ArgumentsHost, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { PrismaService } from '../../prisma/prisma.service';

describe('CRM error privacy', () => {
  it('does not store search terms or a driver error containing contact values', () => {
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
          path: '/crm/contacts',
          url: '/crm/contacts?q=SensitiveName',
          auth: { facilityId: 'f', userId: 'u' },
        }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    filter.catch(new Error('Driver failure with SensitiveName and +93700123456'), host);
    expect(JSON.stringify(create.mock.calls)).not.toMatch(/SensitiveName|93700123456/);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/SensitiveName|93700123456/);
    const written = create.mock.calls[0][0];
    expect(written.data.path).toBe('/crm/contacts');
    expect(written.data.stack).toBeNull();
    log.mockRestore();
  });
});
