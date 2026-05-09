/*
 * Tests for the login-message builder. The format MUST exactly match the
 * backend regex; we copy it verbatim here so a regression in either side
 * surfaces here first.
 */
import { describe, it, expect } from 'vitest';

import { buildLoginMessage, AUTH_LOGIN_MESSAGE_FORMAT_VERSION } from './messages';

// Verbatim copy of `AuthService.LOGIN_MESSAGE_RE` (see
// backend/src/modules/auth/auth.service.ts:295). If the backend changes
// the regex, this test fails; update both sides together.
const BACKEND_LOGIN_MESSAGE_RE =
	/^Login to Areal at (\S+) (?:for wallet|from) ([1-9A-HJ-NP-Za-km-z]{32,44})\s*$/;

const WALLET_A = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
const WALLET_B = '6YRfYtkZmqWgz8N3MDeqJRc4vSiJ5VGgiMv4ihYzJyY4';

describe('buildLoginMessage', () => {
	it('exposes a stable format version constant', () => {
		expect(AUTH_LOGIN_MESSAGE_FORMAT_VERSION).toBe(1);
	});

	it('is deterministic given a fixed clock', () => {
		const now = new Date('2026-05-08T10:30:00.000Z');
		const a = buildLoginMessage(WALLET_A, now);
		const b = buildLoginMessage(WALLET_A, now);
		expect(a.message).toBe(b.message);
		expect(a.timestamp).toBe(b.timestamp);
	});

	it('produces the exact backend-accepted format', () => {
		const now = new Date('2026-05-08T10:30:00.000Z');
		const { message, timestamp } = buildLoginMessage(WALLET_A, now);
		expect(message).toBe(`Login to Areal at ${timestamp} for wallet ${WALLET_A}`);
	});

	it('emits an ISO-8601 timestamp in UTC', () => {
		const now = new Date('2026-05-08T10:30:00.123Z');
		const { timestamp } = buildLoginMessage(WALLET_A, now);
		expect(timestamp).toBe('2026-05-08T10:30:00.123Z');
	});

	it('the produced message matches the backend LOGIN_MESSAGE_RE', () => {
		const now = new Date('2026-05-08T10:30:00.000Z');
		const { message } = buildLoginMessage(WALLET_A, now);
		const m = message.match(BACKEND_LOGIN_MESSAGE_RE);
		expect(m).not.toBeNull();
		expect(m![1]).toBe('2026-05-08T10:30:00.000Z');
		expect(m![2]).toBe(WALLET_A);
	});

	it('different wallets produce different messages (replay binding)', () => {
		const now = new Date('2026-05-08T10:30:00.000Z');
		const a = buildLoginMessage(WALLET_A, now);
		const b = buildLoginMessage(WALLET_B, now);
		expect(a.message).not.toBe(b.message);
		expect(a.message.endsWith(WALLET_A)).toBe(true);
		expect(b.message.endsWith(WALLET_B)).toBe(true);
	});

	it('the embedded timestamp round-trips back to the same Date instant', () => {
		const now = new Date('2026-05-08T10:30:00.000Z');
		const { timestamp } = buildLoginMessage(WALLET_A, now);
		expect(Date.parse(timestamp)).toBe(now.getTime());
	});

	it('default clock produces a parseable timestamp close to now', () => {
		const before = Date.now();
		const { timestamp } = buildLoginMessage(WALLET_A);
		const t = Date.parse(timestamp);
		const after = Date.now();
		expect(t).toBeGreaterThanOrEqual(before);
		expect(t).toBeLessThanOrEqual(after);
	});
});
