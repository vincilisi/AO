import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyRequest } from "fastify";
import { database } from "@ai-office/database";

const scryptAsync = promisify(scrypt);
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthContext {
  userId: string;
  companyId: string;
  name: string;
  email: string;
  role: string;
}

function unauthorized(message = "Autenticazione richiesta") {
  return Object.assign(new Error(message), { statusCode: 401 });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = await scryptAsync(password, salt, 64) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, companyId: string) {
  const token = randomBytes(32).toString("base64url");
  await database.session.create({
    data: { tokenHash: tokenHash(token), userId, companyId, expiresAt: new Date(Date.now() + SESSION_DURATION_MS) }
  });
  return token;
}

export async function authenticate(request: FastifyRequest): Promise<AuthContext> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) throw unauthorized();
  const token = authorization.slice(7);
  const session = await database.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true }
  });
  if (!session || session.expiresAt <= new Date()) throw unauthorized("Sessione scaduta");
  return {
    userId: session.userId,
    companyId: session.companyId,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role
  };
}