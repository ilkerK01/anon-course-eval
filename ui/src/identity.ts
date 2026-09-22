import { fromHex, toHex } from '../../api/src/index';

const STORAGE_KEY = 'candor-identity-v1';

export const loadSecret = (): Uint8Array => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return fromHex(stored);
  const secret = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(STORAGE_KEY, toHex(secret));
  return secret;
};

export const importSecret = (hex: string): Uint8Array => {
  const secret = fromHex(hex);
  localStorage.setItem(STORAGE_KEY, toHex(secret));
  return secret;
};

export const exportSecret = (secret: Uint8Array): string => toHex(secret);
