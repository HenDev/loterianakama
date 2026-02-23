# Repository Guidelines

## Project Structure & Module Organization
Core code lives in `src/`.
- `src/scenes/`: Phaser scene flow (`BootScene`, `LobbyScene`, `GameScene`, `ResultScene`, `NakamaMatchScene`).
- `src/services/`: game/network/audio logic (`GameService`, `NetworkService`, `MockNetworkService`, `NakamaNetworkService`).
- `src/components/`: Phaser UI building blocks.
- `src/data/`, `src/types/`, `src/utils/`: static data, shared types, helpers.
- `src/tests/`: Vitest unit tests (`*.test.ts`).
Entry points are `src/main.tsx` (React shell) and `src/game.ts` (Phaser config).

## Build, Test, and Development Commands
Use Node + npm (lockfiles exist for npm and pnpm; prefer npm unless the team decides otherwise).
- `npm run dev`: start Vite dev server at `http://localhost:5173`.
- `npm run build`: production bundle in `dist/`.
- `npm run preview`: serve the production build locally.
- `npm run lint`: run ESLint on the repo.
- `npm run typecheck`: strict TypeScript checks (`tsc --noEmit`).
- `npm run test`, `npm run test:watch`, `npm run test:ui`: run Vitest in CI, watch, and UI modes.

## Coding Style & Naming Conventions
- Language: TypeScript (`strict: true`), React 18, Phaser 3.
- Indentation: 2 spaces; keep modules focused and single-purpose.
- Naming: `PascalCase` for scenes/components/services classes, `camelCase` for variables/functions, `SCREAMING_SNAKE_CASE` for constants.
- Tests: place under `src/tests/` with `*.test.ts` suffix.
- Run `npm run lint && npm run typecheck` before opening a PR.

## Testing Guidelines
Framework: Vitest (`environment: node`, globals enabled). Test paths are `src/tests/**/*.test.ts`.
- Add unit tests for any changes in `src/services/` and `src/utils/`.
- Prefer deterministic tests (no real network/audio side effects).
- Keep fixture data small and explicit.

## Commit & Pull Request Guidelines
Git history is not available in this workspace snapshot (`.git` missing), so no existing commit pattern could be verified.
Recommended convention:
- Commit format: `type(scope): short summary` (e.g., `feat(game): add diagonal win validation`).
- PRs should include: purpose, key changes, test evidence (`npm run test` output), and screenshots/GIFs for scene/UI updates.
- Link related issues and call out breaking changes clearly.
