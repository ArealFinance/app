/**
 * Preemptive refresh threshold: when the access token expires within
 * this window, api-fetch and the realtime client trigger a refresh
 * BEFORE the next outgoing request. Tuned for typical 15-min access
 * tokens — 60s = ~6.7% buffer, enough for fetch RTT + jitter on flaky
 * mobile, not enough to inflate refresh rate at short sessions.
 */
export const REFRESH_THRESHOLD_MS = 60_000;
