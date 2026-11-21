import { PROFILE_OVERRIDES } from './presets.js';
import type { ExtensionSettings, TimeLockState } from './types.js';

const PBKDF2_ITERATIONS = 210_000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

function getCrypto(): Crypto {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  throw new Error('WebCrypto API unavailable');
}

export async function derivePinHash(
  pin: string,
  saltHex?: string
): Promise<{ hashHex: string; saltHex: string }> {
  const cryptoApi = getCrypto();
  const salt = saltHex
    ? fromHex(saltHex)
    : cryptoApi.getRandomValues(new Uint8Array(16));
  const encoded = new TextEncoder().encode(pin);
  const key = await cryptoApi.subtle.importKey('raw', encoded, 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await cryptoApi.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    256
  );
  return {
    hashHex: toHex(new Uint8Array(bits)),
    saltHex: toHex(salt),
  };
}

export async function verifyPartnerPin(
  pin: string,
  state: TimeLockState
): Promise<boolean> {
  if (!state.pinHashHex || !state.pinSaltHex) return true;
  if (!pin || pin.length < 4) return false;
  const derived = await derivePinHash(pin, state.pinSaltHex);
  return timingSafeEqual(fromHex(derived.hashHex), fromHex(state.pinHashHex));
}

export function isTimeLocked(state: TimeLockState, nowMs = Date.now()): boolean {
  if (state.pinHashHex) return true;
  if (state.lockedUntilMs > nowMs) return true;
  if (state.pendingUnlockAtMs > nowMs) return true;
  return false;
}

/**
 * Initiates a Plucky-style offline cooldown before protection can be weakened.
 * Tightening protection is always allowed instantly (0ms).
 */
export function startUnlockCooldown(
  state: TimeLockState,
  nowMs = Date.now()
): TimeLockState {
  if (state.pendingUnlockAtMs > nowMs) return state;
  return {
    ...state,
    pendingUnlockAtMs: nowMs + Math.max(60_000, state.cooldownDurationMs),
  };
}

/**
 * Determines whether transitioning from `current` settings to `next` settings
 * weakens gaze protection (which must be blocked while Time-Lock or PIN is active).
 */
export function isWeakeningChange(
  current: ExtensionSettings,
  next: ExtensionSettings
): boolean {
  if (current.enabled && !next.enabled) return true;
  if (next.whitelist.some((h) => !current.whitelist.includes(h))) return true;
  if (current.zeroFlashShield && !next.zeroFlashShield) return true;
  if (current.failClosedOnError && !next.failClosedOnError) return true;
  if (!current.altHoverPeek && next.altHoverPeek) return true;

  const sensRank = { relaxed: 0, balanced: 1, strict: 2 } as const;
  if (sensRank[next.sensitivity] < sensRank[current.sensitivity]) return true;
  if (next.blurIntensityPx < current.blurIntensityPx) return true;

  const cOvr = current.overrides ?? PROFILE_OVERRIDES[current.profile];
  const nOvr = next.overrides ?? PROFILE_OVERRIDES[next.profile];
  if (cOvr.blurFemaleFace && !nOvr.blurFemaleFace) return true;
  if (cOvr.blurMaleFace && !nOvr.blurMaleFace) return true;
  if (cOvr.blurAwrahBody && !nOvr.blurAwrahBody) return true;
  if (cOvr.blurExposedNudity && !nOvr.blurExposedNudity) return true;
  if (cOvr.autoEscalateNsfw && !nOvr.autoEscalateNsfw) return true;
  if (nOvr.exemptChildrenUnderAge > cOvr.exemptChildrenUnderAge) return true;

  return false;
}
