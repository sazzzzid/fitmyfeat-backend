import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const LOGO_TOO_LARGE = 'Gym logo must be an image';
export const LOGO_REQUIRED = 'Gym logo must be an image';
export const MAX_LOGO_BYTES = 2_000_000;

export const GYM_LOGO_DIRECTORY = join(process.cwd(), 'uploads', 'gym-logos');

const TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
} as const;

type LogoType = keyof typeof TYPES;

export interface LogoFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export function logoExtension(file: LogoFile): string | undefined {
  if (file.size < 1 || file.size > MAX_LOGO_BYTES) {
    return undefined;
  }
  const type = file.mimetype as LogoType;
  const extension = TYPES[type];
  if (!extension || !matchesSignature(file.buffer, type)) {
    return undefined;
  }
  return extension;
}

export async function writeGymLogo(
  gymId: string,
  extension: string,
  bytes: Buffer,
  directory = GYM_LOGO_DIRECTORY,
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const names = await readdir(directory);
  await Promise.all(
    names
      .filter((name) => name.startsWith(`${gymId}.`))
      .map((name) => rm(join(directory, name), { force: true })),
  );
  await writeFile(join(directory, `${gymId}${extension}`), bytes);
  return `/uploads/gym-logos/${gymId}${extension}`;
}

function matchesSignature(bytes: Buffer, type: LogoType): boolean {
  if (type === 'image/png') {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (type === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === 'image/gif') {
    const head = bytes.subarray(0, 6).toString('ascii');
    return head === 'GIF87a' || head === 'GIF89a';
  }
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}
