# Contributing to Patchbay

Thanks for your interest! Please:

- Use Conventional Commits
- Include tests for new behavior
- Sign off your commits (DCO): `git commit -s -m "feat: ..."`

## Setup

- pnpm install
- Configure `.env` from `.env.example`
- Apply SQL under `supabase/migrations`

## Development

- `pnpm dev` to run the app
- `pnpm test` for unit tests
- `pnpm lint` and `pnpm typecheck` before PR

## Code Style

- TypeScript strict
- Keep comments concise and purposeful
- Prefer early returns and clear naming
