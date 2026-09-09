import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derivar = promisify(scrypt) as (
  senha: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * A senha do auxiliar de ensino é guardada como hash, não cifrada: ninguém
 * — nem a Esmeraldinha — precisa lê-la de volta, só conferir se confere. É a
 * diferença para a senha do professor, que o portal exige em texto claro e
 * por isso passa pelo `EncryptionPort`.
 */
export async function hashDeSenha(senha: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derivar(senha, salt, KEY_BYTES);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Confere a senha contra o hash gravado, sem vazar tempo na comparação. */
export async function senhaConfere(senha: string, guardado: string): Promise<boolean> {
  const [algoritmo, saltB64, hashB64] = guardado.split('$');
  if (algoritmo !== 'scrypt' || !saltB64 || !hashB64) return false;

  const esperado = Buffer.from(hashB64, 'base64');
  const obtido = await derivar(senha, Buffer.from(saltB64, 'base64'), esperado.length);

  return esperado.length === obtido.length && timingSafeEqual(esperado, obtido);
}

/**
 * Compara duas strings sem vazar tempo. Usada com a senha temporária, que
 * mora no ambiente em texto claro e não tem hash com que ser conferida.
 */
export function textoConfere(informado: string, esperado: string): boolean {
  const a = Buffer.from(informado);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}
