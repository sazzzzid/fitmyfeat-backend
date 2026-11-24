import { BadRequestException } from '@nestjs/common';

export const QUERY_INVALID = 'Query is not valid';

const DAY = /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/;
const DAY_MS = 86_400_000;

export interface DayRange {
  from: string;
  to: string;
  start: Date;
  endExclusive: Date;
}

export interface Page<T> {
  rows: T[];
  nextCursor?: string | null;
}

export function searchNeedle(q: unknown): string | undefined {
  if (q === undefined) {
    return undefined;
  }
  if (typeof q !== 'string') {
    throw new BadRequestException(QUERY_INVALID);
  }
  const needle = q.trim().toLowerCase();
  return needle.length === 0 ? undefined : needle;
}

export function parseOptionalDayRange(
  from: unknown,
  to: unknown,
): DayRange | undefined {
  if (from === undefined && to === undefined) {
    return undefined;
  }
  return parseRequiredDayRange(from, to);
}

export function parseRequiredDayRange(from: unknown, to: unknown): DayRange {
  if (
    typeof from !== 'string' ||
    typeof to !== 'string' ||
    !DAY.test(from) ||
    !DAY.test(to) ||
    from > to
  ) {
    throw new BadRequestException(QUERY_INVALID);
  }
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (
    start.toISOString().slice(0, 10) !== from ||
    end.toISOString().slice(0, 10) !== to
  ) {
    throw new BadRequestException(QUERY_INVALID);
  }
  return {
    from,
    to,
    start,
    endExclusive: new Date(end.getTime() + DAY_MS),
  };
}

export function slicePage<T>(
  rows: T[],
  limit: number | undefined,
  cursor: string | undefined,
  idOf: (row: T) => string,
): Page<T> {
  let start = 0;
  if (cursor !== undefined) {
    const id = decodeCursor(cursor);
    const index = rows.findIndex((row) => idOf(row) === id);
    if (index < 0) {
      throw new BadRequestException(QUERY_INVALID);
    }
    start = index + 1;
  }
  if (limit === undefined) {
    return { rows: rows.slice(start) };
  }
  const page = rows.slice(start, start + limit);
  const hasMore = start + page.length < rows.length;
  return {
    rows: page,
    nextCursor:
      hasMore && page.length > 0 ? encodeCursor(idOf(page[page.length - 1]!)) : null,
  };
}

export function pageBody<K extends string, T>(
  key: K,
  rows: T[],
  limit: number | undefined,
  cursor: string | undefined,
  idOf: (row: T) => string,
): { [P in K]: T[] } & { nextCursor?: string | null } {
  const page = slicePage(rows, limit, cursor, idOf);
  const body = { [key]: page.rows } as { [P in K]: T[] } & {
    nextCursor?: string | null;
  };
  if (limit !== undefined) {
    body.nextCursor = page.nextCursor ?? null;
  }
  return body;
}

function encodeCursor(id: string): string {
  return Buffer.from(`v1:${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new BadRequestException(QUERY_INVALID);
  }
  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!text.startsWith('v1:') || text.length < 4) {
    throw new BadRequestException(QUERY_INVALID);
  }
  return text.slice(3);
}
