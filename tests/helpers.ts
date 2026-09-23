import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { EmailMessage } from "../src/services/email.service";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@example.test`;
}

/** Pulls the raw token out of the link embedded in a captured EmailService.send() call. */
export function extractToken(msg: EmailMessage): string {
  const match = msg.text.match(/token=([a-f0-9]{64})/);
  if (!match) throw new Error(`No token found in email text: ${msg.text}`);
  return match[1];
}

// Module-scoped counter (shared by every test file, since Node caches this module once per
// process) — guarantees distinct 2-letter ISO codes across the whole test run instead of relying
// on randomness, which is what made an earlier version of these tests occasionally collide.
// Seeded with a random offset so repeated local runs against a persistent (non-fresh) dev
// database don't collide with leftover rows from a previous run — CI always starts from a fresh
// database, so there the offset is irrelevant.
let isoCodeCounter = Math.floor(Math.random() * 400);
export function uniqueIsoCode2(): string {
  const n = isoCodeCounter++;
  const a = String.fromCharCode(65 + Math.floor(n / 26));
  const b = String.fromCharCode(65 + (n % 26));
  return a + b;
}

/** A single reusable Country fixture for Business/Branch/Catalog tests that just need *a*
 * valid country and don't care which one — idempotent, safe to call from every test file. */
export async function ensureTestCountry(prisma: PrismaClient) {
  return prisma.country.upsert({
    where: { isoCode2: "XT" },
    update: {},
    create: { name: "Test Country", isoCode2: "XT", currencyCode: "TST", defaultLanguage: "en" },
  });
}
