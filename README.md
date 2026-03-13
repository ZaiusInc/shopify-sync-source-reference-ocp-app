# Shopify Source Sync Reference App

A reference OCP app that synchronizes Shopify product catalog data into Optimizely Connect Platform through the Sync Manager. This app accompanies the [Shopify sync source end-to-end guide](https://docs.developers.optimizely.com/optimizely-connect-platform/docs/shopify-sync-source-end-to-end-guide).

## Features

- **Historical import** — A triggered job that imports all Shopify products in batches of 50, with retry logic and progress tracking.
- **Real-time sync** — A webhook function that receives Shopify product create, update, and delete events.
- **Webhook management** — Automatic webhook registration on credential save and cleanup on uninstall.
- **GraphQL API** — Uses Shopify's GraphQL Admin API with a converter to a REST-compatible internal format.

## Project structure

```
src/
├── data/ShopifyProducts.ts          — TypeScript interfaces (GraphQL + REST formats)
├── functions/ProductWebhook.ts      — Webhook handler for real-time product sync
├── jobs/ImportProducts.ts           — Historical import job (prepare/perform pattern)
├── lib/
│   ├── ShopifyClient.ts             — Shopify API client (GraphQL + REST)
│   ├── ShopifyWebhookManager.ts     — Webhook registration and cleanup
│   ├── shopifyConverter.ts          — GraphQL-to-REST format converter
│   └── transformProductToPayload.ts — Product-to-OCP payload transformer
├── lifecycle/Lifecycle.ts           — Credential validation, webhook setup, import trigger
└── sources/schema/shopify_products.yml — Source schema with nested types
```

## Getting started

Ensure [Node.js](https://nodejs.org/) (v22+) and [yarn](https://yarnpkg.com/) are installed, then:

```bash
yarn install
```

## Build and test

```bash
yarn build    # Compile TypeScript and copy assets to dist/
yarn test     # Run unit tests with Vitest
yarn validate # Build + lint + test
```

## Deploy to OCP

```bash
ocp app prepare --publish                              # Publish a dev version
ocp directory install ocp_sync_source_reference_app@1.0.0-dev.1 <TRACKER_ID>  # Install to sandbox
```

See the [end-to-end guide](https://docs.developers.optimizely.com/optimizely-connect-platform/docs/shopify-sync-source-end-to-end-guide) for full instructions.

## OCP CLI

After customizing your app, use the [Optimizely Connect Platform CLI](https://docs.developers.optimizely.com/optimizely-connect-platform/docs/ocp-get-started-development-environment) to register, upload, and publish your app.
