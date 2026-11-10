import * as crypto from 'crypto';

/** scrypt con sal aleatoria; formato `scrypt$N$salt$hash`. */
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const N = 16384;
  const h = crypto.scryptSync(plain, salt, 64, { N });
  return `scrypt$${N}$${salt.toString('base64')}$${h.toString('base64')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [alg, n, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(plain, Buffer.from(salt, 'base64'), expected.length, { N: Number(n) });
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}
