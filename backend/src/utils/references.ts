import { randomUUID } from 'node:crypto';

/**
 * Short-lived store for objects passed by reference (G-1): a credential offer
 * or presentation definition too large for a QR code is fetched by the wallet
 * from credential_offer_uri / presentation_definition_uri instead.
 */
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 500;
const store = new Map<string, { body: unknown; expires: number }>();

/** Stores body and returns its path, relative to the BFF origin. */
export function storeReference(body: unknown): string {
  const now = Date.now();
  for (const [id, entry] of store) if (entry.expires < now) store.delete(id);
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value!);
  const id = randomUUID();
  store.set(id, { body, expires: now + TTL_MS });
  return `/api/playground/ref/${id}`;
}

export function getReference(id: string): unknown {
  const entry = store.get(id);
  return entry && entry.expires >= Date.now() ? entry.body : undefined;
}
