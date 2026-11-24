import { BadRequestException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PlatformExceptionFilter } from './platform-exception.filter.js';

function respond(exception: unknown): { status: number; body: unknown } {
  const result = { status: 0, body: undefined as unknown };
  const response = {
    status: vi.fn((code: number) => {
      result.status = code;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      result.body = body;
    }),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new PlatformExceptionFilter().catch(exception, host);
  return result;
}

describe('PlatformExceptionFilter', () => {
  it('reports a repeated validation message once', () => {
    const result = respond(
      new BadRequestException([
        'Plan values are not valid',
        'Plan values are not valid',
        'Plan values are not valid',
      ]),
    );
    expect(result).toEqual({
      status: 400,
      body: { statusCode: 400, message: 'Plan values are not valid' },
    });
  });

  it('keeps distinct validation messages in order', () => {
    const result = respond(
      new BadRequestException([
        'email must be a string',
        'password must be a string',
        'email must be a string',
      ]),
    );
    expect(result.body).toEqual({
      statusCode: 400,
      message: 'email must be a string, password must be a string',
    });
  });

  it('returns a string message unchanged', () => {
    const result = respond(new BadRequestException('Role name is not valid'));
    expect(result.body).toEqual({
      statusCode: 400,
      message: 'Role name is not valid',
    });
  });

  it('hides unexpected errors behind a fixed message', () => {
    const result = respond(new Error('relation "plans" does not exist'));
    expect(result).toEqual({
      status: 500,
      body: { statusCode: 500, message: 'Unexpected error' },
    });
  });
});
