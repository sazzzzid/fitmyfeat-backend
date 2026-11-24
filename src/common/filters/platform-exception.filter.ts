import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

export const UNEXPECTED_ERROR_MESSAGE = 'Unexpected error';

@Catch()
export class PlatformExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      response.status(statusCode).json({
        statusCode,
        message: messageFromHttpException(exception),
      });
      return;
    }
    response.status(500).json({
      statusCode: 500,
      message: UNEXPECTED_ERROR_MESSAGE,
    });
  }
}

function messageFromHttpException(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') {
    return body;
  }
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      // Several DTO fields can fail with the same text; report it once.
      return [...new Set(message.map((item) => String(item)))].join(', ');
    }
  }
  return exception.message;
}
