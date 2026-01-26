# 10x-cards

![Node](https://img.shields.io/badge/node-22.14.0-3c873a)
![Astro](https://img.shields.io/badge/astro-5-ff5d01)
![React](https://img.shields.io/badge/react-19-149eca)
![TypeScript](https://img.shields.io/badge/typescript-5-3178c6)
![License](https://img.shields.io/badge/license-MIT-blue)

## Project description

10x-cards is a web app for creating and reviewing spaced-repetition flashcards. The MVP focuses on a generate-first flow: users paste source text, generate flashcards via an LLM, review/edit them, and save to a personal deck for scheduled reviews using an existing SRS implementation. The initial launch supports English only with basic email/password authentication.

Docs: [PRD](.ai/prd.md), [Tech stack](.ai/tech-stack.md)

## Table of contents

- [Tech stack](#tech-stack)
- [Getting started locally](#getting-started-locally)
- [Available scripts](#available-scripts)
- [Project scope](#project-scope)
- [Project status](#project-status)
- [License](#license)

## Tech stack

Frontend
- [Astro 5](https://astro.build/) for fast, content-focused UI with minimal JavaScript
- [React 19](https://react.dev/) for interactive components
- [TypeScript 5](https://www.typescriptlang.org/) for static typing
- [Tailwind CSS 4](https://tailwindcss.com/) for styling
- [shadcn/ui](https://ui.shadcn.com/) for accessible UI components

Backend
- [Supabase](https://supabase.com/) (PostgreSQL, Auth, and SDK) as the Backend-as-a-Service

AI
- [OpenRouter](https://openrouter.ai/) for LLM access and API key spend limits

Testing
- [Vitest](https://vitest.dev/) for unit and integration tests
- [Testing Library](https://testing-library.com/) for React component tests
- [MSW](https://mswjs.io/) for API mocking in UI tests
- [Playwright](https://playwright.dev/) for end-to-end testing

CI/CD and hosting
- GitHub Actions for CI/CD pipelines
- DigitalOcean hosting via Docker image

Core dependencies
- [Supabase JS](https://supabase.com/docs/reference/javascript/introduction) for data and auth
- [Zod](https://zod.dev/) for schema validation

## Getting started locally

Prerequisites
- Node.js `22.14.0` (from `.nvmrc`)
- npm (bundled with Node.js)

Install and run
```bash
npm install
npm run dev
```

Optional build and preview
```bash
npm run build
npm run preview
```

## Available scripts

- `npm run dev` - start the Astro dev server
- `npm run dev:e2e` - start dev server in test mode for E2E
- `npm run build` - build for production
- `npm run preview` - preview the production build
- `npm run astro` - run Astro CLI
- `npm run lint` - run ESLint
- `npm run lint:fix` - run ESLint with auto-fix
- `npm run format` - format with Prettier
- `npm run test:unit` - run Vitest in CI mode
- `npm run test:unit:watch` - watch mode for unit tests
- `npm run test:unit:ui` - Vitest UI
- `npm run test:e2e` - run Playwright tests
- `npm run test:e2e:ui` - Playwright UI
- `npm run test:e2e:debug` - Playwright debug mode
- `npm run test:e2e:report` - show Playwright report

## Project scope

Included in MVP
- AI generation from pasted text with accept/edit/save workflow
- Manual card creation and CRUD for cards and decks
- Email/password auth with password reset
- Integration with an existing spaced-repetition algorithm
- Event instrumentation for AI acceptance metrics
- Immediate, irreversible account deletion (GDPR)

## Project status

MVP scope is defined in the PRD and is under active development.

## License

MIT
