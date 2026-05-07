export { createConnection, createWsConnection } from './connection';
export { readNavBookValue } from './reads';
export type { NavBookValueSnapshot } from './reads';

// Portfolio composite read — re-exported for convenience.
export { getHolderPortfolio } from '@areal/sdk/portfolio';
export type { PortfolioRow, PortfolioSnapshot } from '@areal/sdk/portfolio';
