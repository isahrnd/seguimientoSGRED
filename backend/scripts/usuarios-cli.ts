/**
 * Crea (o actualiza la contraseña de) una cuenta de consulta. Se ejecuta en el servidor, sin HTTP.
 *   npm run usuarios:crear -- <correo> "<Nombre>"      (la contraseña se pide por SEGUIMIENTO_NUEVA_CLAVE o se genera)
 * Imprime el id de la cuenta para SEGUIMIENTO_USUARIO_ID. La contraseña generada se muestra una sola vez.
 */
import 'reflect-metadata';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password';

/** Cambia el correo de una cuenta conservando id, contraseña, estado y acceso. Uso: correo-cambiar <actual> <nuevo> */
async function cambiarCorreo(actual: string, nuevo: string) {
  const ok = (c?: string) => !!c && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);
  if (!ok(actual) || !ok(nuevo)) { console.error('Uso: usuarios-cli correo-cambiar <actual> <nuevo>'); process.exit(1); }
  const prisma = new PrismaClient({ log: [] });
  try {
    const u = await prisma.usuarios.update({ where: { correo: actual.toLowerCase() }, data: { correo: nuevo.toLowerCase() } });
    console.log(`Correo actualizado. id=${u.id} correo=${u.correo} (contraseña y acceso sin cambios)`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const [cmd, correo, nombre] = process.argv.slice(2);
  if (cmd === 'correo-cambiar') return cambiarCorreo(correo, nombre);
  if (cmd !== 'crear' || !correo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
    console.error('Uso: usuarios:crear -- <correo> "<Nombre>"');
    process.exit(1);
  }
  const clave = process.env.SEGUIMIENTO_NUEVA_CLAVE || crypto.randomBytes(15).toString('base64url');
  if (clave.length < 12) { console.error('La contraseña debe tener al menos 12 caracteres.'); process.exit(1); }
  const prisma = new PrismaClient({ log: [] });
  try {
    const u = await prisma.usuarios.upsert({
      where: { correo: correo.toLowerCase() },
      create: { correo: correo.toLowerCase(), nombre: nombre || correo, password_hash: hashPassword(clave) },
      update: { password_hash: hashPassword(clave), estado: true, ...(nombre ? { nombre } : {}) },
    });
    console.log(`Cuenta lista. id=${u.id} correo=${u.correo}`);
    if (!process.env.SEGUIMIENTO_NUEVA_CLAVE) console.log(`Contraseña generada (guárdela ahora; no se vuelve a mostrar): ${clave}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
