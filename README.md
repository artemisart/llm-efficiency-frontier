# LLM Efficiency Frontier

A benchmark explorer running on [vinext](https://github.com/cloudflare/vinext).

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites R2 bindings
- `vite.config.ts` simulates declared bindings for local development

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
