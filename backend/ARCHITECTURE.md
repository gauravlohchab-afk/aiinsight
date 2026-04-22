# Backend Architecture Refactor

## Target Structure

```text
backend/
  src/
    app.ts
    config/
      env.ts
      logger.ts
      database.ts
      index.ts
    integrations/
      meta/
        meta.client.ts
        meta.mapper.ts
      openai/
        openai.client.ts
    modules/
      ai/
        ai.routes.ts
        ai.controller.ts
        ai.service.ts
        ai.types.ts
        ai-insight.model.ts
      campaigns/
        campaign.routes.ts
        campaign.controller.ts
        campaign.service.ts
        campaign.types.ts
        campaign.model.ts
      analytics/
        analytics.routes.ts
        analytics.controller.ts
        analytics.service.ts
        analytics.types.ts
      auth/
        auth.routes.ts
        auth.controller.ts
        auth.service.ts
        auth.types.ts
    middleware/
      auth.ts
      error-handler.ts
      request-context.ts
    shared/
      errors/
        app-error.ts
      http/
        api-response.ts
      utils/
        request-cache.ts
    models/
      campaign.model.ts
      ad.model.ts
      ad-set.model.ts
      user.model.ts
    workers/
      sync-worker.ts
```

## Naming Conventions

- Use `kebab-case` for file names: `ai.routes.ts`, `campaign.service.ts`, `error-handler.ts`.
- Use `PascalCase` for classes and Mongoose models: `AIController`, `CampaignService`, `AIInsight`.
- Use singular nouns for service and controller files: `ai.service.ts`, not `AIServices.ts`.
- Use explicit suffixes for layers: `.routes.ts`, `.controller.ts`, `.service.ts`, `.model.ts`, `.types.ts`.

## Example Module

The AI module is now split into:

- `src/modules/ai/ai.routes.ts`: validators and route-to-controller wiring only.
- `src/modules/ai/ai.controller.ts`: request parsing and response shaping only.
- `src/modules/ai/ai.service.ts`: orchestration, DB access, fallbacks, and integration coordination.
- `src/modules/ai/ai-insight.model.ts`: feature-owned model.
- `src/modules/ai/ai.types.ts`: shared DTOs and response contracts.
- `src/integrations/openai/openai.client.ts`: external provider client setup.

## Anti-Patterns Found In Current Backend

- Routes contain orchestration, fallback logic, DB queries, and third-party API calls.
- Feature code is split across flat top-level folders, so ownership is unclear.
- Type contracts live inside service files, which makes reuse and testing harder.
- External integrations are mixed into services instead of being isolated behind clients or adapters.
- File naming is inconsistent across `AIService`, route names, and mixed camelCase file paths.
- `config/index.ts` combines env validation, logger bootstrap, Redis config, and database connection in one file.

## Best Practice Targets

- Error handling: move `AppError`, response serialization, and async wrappers into `shared/errors` and keep controllers thin.
- Logging: centralize a request-aware logger with correlation IDs in `config/logger.ts` plus `middleware/request-context.ts`.
- Environment validation: validate env with `zod` in `config/env.ts` and export a typed config object rather than reading `process.env` ad hoc.
- Integrations: keep raw OpenAI and Meta SDK wiring in `src/integrations/*`, then consume them from services through small adapters.
