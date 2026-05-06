import nacl from 'tweetnacl';

// ── Base58 alphabet (Bitcoin standard) ──────────────────────────────────────
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// ── localStorage key constants ──────────────────────────────────────────────
const LS_SECRET = 'phantom_dl_secret';
const LS_PUBKEY = 'phantom_dl_pubkey';
const LS_SHARED = 'phantom_dl_shared';
const LS_SESSION = 'phantom_dl_session';
const LS_WALLET = 'phantom_dl_wallet';
const LS_MESSAGE = 'phantom_dl_message';

const LS_PREFIX = 'phantom_dl_';

// ── Mobile detection ────────────────────────────────────────────────────────

/** Check whether the current device is a mobile phone or tablet. */
export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// ── Base58 encode / decode ──────────────────────────────────────────────────

/** Encode a byte array into a Base58 string (Bitcoin alphabet). */
export function b58encode(bytes: Uint8Array): string {
  // Count leading zeros
  let zeros = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    zeros++;
  }

  // Convert byte array to a big integer, then repeatedly divide by 58
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  // Leading '1's for each leading zero byte
  let result = B58_ALPHABET[0].repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    result += B58_ALPHABET[digits[i]];
  }
  return result;
}

/** Decode a Base58 string back into a byte array. */
export function b58decode(str: string): Uint8Array {
  // Count leading '1' characters (they map to 0x00 bytes)
  let zeros = 0;
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    zeros++;
  }

  // Convert base58 digits to a big-endian byte array
  const bytes: number[] = [];
  for (let i = zeros; i < str.length; i++) {
    const charIndex = B58_ALPHABET.indexOf(str[i]);
    if (charIndex === -1) {
      throw new Error(`Invalid Base58 character: ${str[i]}`);
    }
    let carry = charIndex;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Reverse to big-endian and prepend leading zero bytes
  bytes.reverse();
  const result = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[zeros + i] = bytes[i];
  }
  return result;
}

// ── Deep link: connect ──────────────────────────────────────────────────────

/**
 * Start Phantom deep-link connect flow.
 *
 * Generates a NaCl keypair, persists it in localStorage,
 * then redirects the browser to `phantom.app/ul/v1/connect`.
 *
 * @param redirectUrl - The URL Phantom will redirect back to after the user approves.
 */
export function initiatePhantomConnect(redirectUrl: string): void {
  const keyPair = nacl.box.keyPair();

  localStorage.setItem(LS_SECRET, b58encode(keyPair.secretKey));
  localStorage.setItem(LS_PUBKEY, b58encode(keyPair.publicKey));

  const redirect = new URL(redirectUrl);
  redirect.searchParams.set('phantom_action', 'connect');

  const url = new URL('https://phantom.app/ul/v1/connect');
  url.searchParams.set('app_url', window.location.origin);
  url.searchParams.set('dapp_encryption_public_key', b58encode(keyPair.publicKey));
  url.searchParams.set('redirect_link', redirect.toString());
  url.searchParams.set('cluster', 'mainnet-beta');

  window.location.href = url.toString();
}

// ── Deep link: handle return ────────────────────────────────────────────────

/**
 * Handle a redirect from Phantom (either connect or signMessage result).
 *
 * Call this on page load when `hasDeepLinkReturn()` is `true`.
 *
 * @returns
 *  - `{ wallet, signature, message }` when the sign flow is complete and the
 *     caller can proceed with backend login.
 *  - `'redirecting'` when the connect step succeeded and the browser is being
 *     redirected to the signMessage deep link (caller should stop further processing).
 *  - `null` when the flow was cancelled by the user or an error occurred.
 */
export function handlePhantomReturn(
  params: URLSearchParams,
): { wallet: string; signature: string; message: string } | 'redirecting' | null {
  const action = params.get('phantom_action');

  if (action === 'connect') {
    return handleConnectReturn(params);
  }

  if (action === 'sign') {
    return handleSignReturn(params);
  }

  return null;
}

// ── Connect return handler ──────────────────────────────────────────────────

function handleConnectReturn(
  params: URLSearchParams,
): 'redirecting' | null {
  if (params.get('errorCode')) {
    return null;
  }

  const phantomPubKeyB58 = params.get('phantom_encryption_public_key');
  const dataB58 = params.get('data');
  const nonceB58 = params.get('nonce');

  if (!phantomPubKeyB58 || !dataB58 || !nonceB58) {
    return null;
  }

  const secretKeyB58 = localStorage.getItem(LS_SECRET);
  if (!secretKeyB58) {
    return null;
  }

  const phantomPubKey = b58decode(phantomPubKeyB58);
  const ciphertext = b58decode(dataB58);
  const nonce = b58decode(nonceB58);
  const mySecretKey = b58decode(secretKeyB58);

  // Derive shared secret
  const sharedSecret = nacl.box.before(phantomPubKey, mySecretKey);
  localStorage.setItem(LS_SHARED, b58encode(sharedSecret));

  // Decrypt connect payload
  const decrypted = nacl.box.open.after(ciphertext, nonce, sharedSecret);
  if (!decrypted) {
    return null;
  }

  const connectData = JSON.parse(new TextDecoder().decode(decrypted));
  if (typeof connectData?.public_key !== 'string' || typeof connectData?.session !== 'string') {
    return null;
  }

  const wallet = connectData.public_key as string;
  localStorage.setItem(LS_SESSION, connectData.session);
  localStorage.setItem(LS_WALLET, wallet);

  // Build the login message (must match format in auth.store.ts)
  const message = `Login to Areal at ${Date.now()} from ${wallet}`;
  localStorage.setItem(LS_MESSAGE, message);

  // Prepare signMessage deep link
  const dappPubKeyB58 = localStorage.getItem(LS_PUBKEY);
  if (!dappPubKeyB58) {
    return null;
  }

  const signNonce = nacl.randomBytes(24);
  const messageBytes = new TextEncoder().encode(message);

  const payload = {
    session: connectData.session,
    message: b58encode(messageBytes),
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const encryptedPayload = nacl.box.after(payloadBytes, signNonce, sharedSecret);

  const signUrl = new URL('https://phantom.app/ul/v1/signMessage');
  signUrl.searchParams.set('dapp_encryption_public_key', dappPubKeyB58);
  signUrl.searchParams.set('nonce', b58encode(signNonce));
  signUrl.searchParams.set(
    'redirect_link',
    `${window.location.origin}${window.location.pathname}?phantom_action=sign`,
  );
  signUrl.searchParams.set('payload', b58encode(encryptedPayload));

  window.location.href = signUrl.toString();
  return 'redirecting';
}

// ── Sign return handler ─────────────────────────────────────────────────────

function handleSignReturn(
  params: URLSearchParams,
): { wallet: string; signature: string; message: string } | null {
  if (params.get('errorCode')) {
    return null;
  }

  const dataB58 = params.get('data');
  const nonceB58 = params.get('nonce');

  if (!dataB58 || !nonceB58) {
    return null;
  }

  const sharedB58 = localStorage.getItem(LS_SHARED);
  const wallet = localStorage.getItem(LS_WALLET);
  const message = localStorage.getItem(LS_MESSAGE);

  if (!sharedB58 || !wallet || !message) {
    return null;
  }

  const sharedSecret = b58decode(sharedB58);
  const ciphertext = b58decode(dataB58);
  const nonce = b58decode(nonceB58);

  const decrypted = nacl.box.open.after(ciphertext, nonce, sharedSecret);
  if (!decrypted) {
    return null;
  }

  const signData = JSON.parse(new TextDecoder().decode(decrypted));
  if (typeof signData?.signature !== 'string') {
    return null;
  }

  return {
    wallet,
    signature: signData.signature as string,
    message,
  };
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

/** Remove all Phantom deep-link state from localStorage. */
export function cleanupDeepLinkState(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LS_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

// ── Detection ───────────────────────────────────────────────────────────────

/** Check whether the current URL contains a Phantom deep-link return parameter. */
export function hasDeepLinkReturn(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('phantom_action');
}
