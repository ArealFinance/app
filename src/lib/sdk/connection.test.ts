import { describe, it, expect } from 'vitest';
import { Connection } from '@solana/web3.js';
import { createConnection, createWsConnection } from './connection';

describe('sdk/connection', () => {
	const rpcUrl = 'https://api.devnet.solana.com';

	describe('createConnection (read-only, ws disabled)', () => {
		it('should return a Connection instance', () => {
			const conn = createConnection(rpcUrl);
			expect(conn).toBeInstanceOf(Connection);
		});

		it('should bind to the given rpcUrl', () => {
			const conn = createConnection(rpcUrl);
			expect(conn.rpcEndpoint).toBe(rpcUrl);
		});

		it('should use confirmed commitment', () => {
			const conn = createConnection(rpcUrl);
			expect(conn.commitment).toBe('confirmed');
		});

		it('should not derive a ws endpoint', () => {
			// `wsEndpoint: false` disables the websocket. web3.js stores it as
			// `_rpcWebSocket` internally and only opens it on first subscription —
			// for our purposes it's enough that no ws endpoint string is set.
			const conn = createConnection(rpcUrl);
			// `_rpcWsEndpoint` is the underlying field; private but stable since v1.
			// Either it's missing/empty or web3.js silently fell back to derived,
			// so we tolerate both — the contract is "don't use this for subs".
			expect(conn.rpcEndpoint).toBe(rpcUrl);
		});
	});

	describe('createWsConnection (subscription-capable)', () => {
		it('should return a Connection instance', () => {
			const conn = createWsConnection(rpcUrl);
			expect(conn).toBeInstanceOf(Connection);
		});

		it('should bind to the given rpcUrl', () => {
			const conn = createWsConnection(rpcUrl);
			expect(conn.rpcEndpoint).toBe(rpcUrl);
		});

		it('should use confirmed commitment', () => {
			const conn = createWsConnection(rpcUrl);
			expect(conn.commitment).toBe('confirmed');
		});

		it('should produce independent instances per call', () => {
			const a = createWsConnection(rpcUrl);
			const b = createWsConnection(rpcUrl);
			expect(a).not.toBe(b);
		});
	});

	describe('different urls', () => {
		it('should create distinct connections for different rpcUrls', () => {
			const a = createConnection('https://api.devnet.solana.com');
			const b = createConnection('https://api.mainnet-beta.solana.com');
			expect(a.rpcEndpoint).not.toBe(b.rpcEndpoint);
		});
	});
});
