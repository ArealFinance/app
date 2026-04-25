# Areal Finance — App

User-facing application for the [Areal Finance](https://areal.finance) protocol. SvelteKit, TypeScript, `@sveltejs/adapter-static`.

Production: **https://app.areal.finance**

## Requirements

- Node.js ≥ 22.17
- npm ≥ 10

## Develop

```bash
npm install
npm run dev       # http://localhost:5173
```

## Build

```bash
npm run build     # → build/  (static, SPA fallback)
```

## Deploy

Static SPA — hosts on any static provider. Production target is **Cloudflare Pages**:

- Framework preset: SvelteKit
- Build command: `npm run build`
- Build output: `build`
- Node version: `22`

Configure `PUBLIC_API_BASE_URL` in CF Pages env vars (see `.env.example`).

## Related

- **Admin/monitoring panel:** [ArealFinance/dashboard](https://github.com/ArealFinance/dashboard)
- **Contracts:** [ArealFinance/contracts](https://github.com/ArealFinance/contracts)
- **Off-chain services:** [ArealFinance/bots](https://github.com/ArealFinance/bots)
- **Full protocol:** [ArealFinance/areal](https://github.com/ArealFinance/areal)

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
