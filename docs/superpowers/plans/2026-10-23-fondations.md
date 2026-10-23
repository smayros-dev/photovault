# Fondations (Monorepo + Infra) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettre en place le squelette monorepo PhotoVault (apps/web Angular, apps/api NestJS, packages/shared), l'infra Docker Compose (PostgreSQL, Redis, MinIO), Prisma avec le modèle `User`, et la CI — livré comme une feature = une PR (`feat/foundations`).

**Architecture:** Monorepo npm workspaces. Angular 20 SSR avec coquille publique, NestJS monolithe modulaire, PostgreSQL pour les métadonnées uniquement (jamais de binaire), MinIO pour les fichiers, Redis pour la file de traitement. Chaque plan de ce projet = une branche = une PR vers `main`.

**Tech Stack:** npm workspaces, Angular 20 (+ SSR, Tailwind 3.4, Vitest), NestJS (+ Jest, supertest), Prisma + PostgreSQL 16, MinIO, Redis 7, Docker Compose, ESLint + Prettier, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-23-photovault-design.md`

## Global Constraints

- Node.js 22 LTS (`engines` + `.nvmrc` + CI `node-version: 22`).
- Angular 20+, standalone, SSR activé ; Tailwind CSS 3.4 (`tailwind.config.js` + directives `@tailwind`).
- NestJS monolithe modulaire ; Prisma comme ORM; PostgreSQL 16.
- PostgreSQL ne stocke **jamais** de fichier binaire (métadonnées + clés de stockage uniquement).
- UI en français (libellés visibles).
- Aucun secret committé : `.env` ignoré, seul `.env.example` versionné (valeurs par défaut locales non sensibles).
- Format/lint : Prettier + ESLint flat config doivent passer sur tout le repo.
- Taille max upload : 25 Mo (constante `MAX_UPLOAD_BYTES` dans `packages/shared`).
- Chaque feature du projet livre une branche `feat/<feature>` → une PR.

## Review Focus

1. **`.env` ou secrets committés** — un dépôt portfolio qui pousse des secrets est disqualifiant ; on s'attend à ce que `git ls-files` ne contienne aucun `.env` (test ajouté au Task 5).
2. **Dérive de version Node** — Angular 20 refuse Node < 20.19 ; on s'attend à ce que `node -v` dans `engines`, `.nvmrc` et CI donnent la même version 22 (test ajouté au Task 7).
3. **Services Docker pas prêts au démarrage** — Prisma et l'API échouent si Postgres/MinIO ne sont pas *healthy* ; on s'attend à ce que `docker compose up --wait` bloque jusqu'aux healthchecks (test ajouté au Task 5).
4. **Échec de migration sur base fraîche** — un clone neuf doit réussir `prisma migrate deploy` contre Postgres vierge (test ajouté au Task 6).
5. **Cassure des builds par le hoisting npm workspaces** — les CLI Angular/Nest peuvent résoudre des versions dupliquées ; on s'attend à ce que les deux apps buildent depuis la racine après `npm ci` (tests ajoutés aux Tasks 3 et 4, rejoués en CI au Task 7).

---

### Task 1: Racine du monorepo (workspaces, lint, format, git)

**Files:**
- Create: `package.json`, `.gitignore`, `.gitattributes`, `.nvmrc`, `.prettierrc.json`, `.prettierignore`, `eslint.config.js`, `tsconfig.base.json`

**Interfaces:**
- Produits: racine npm workspaces (`apps/*`, `packages/*`) ; scripts racine `npm run lint`, `npm run format:check`, `npm run build` (délégués plus tard aux apps) ; `tsconfig.base.json` (strict: true, `paths` vers `@photovault/shared`). Les Tasks 3-4 branchent leurs scripts sur ces noms.

- [ ] **Step 1: Créer la racine workspace**

`package.json` : `{ "name": "photovault", "private": true, "workspaces": ["apps/*", "packages/*"], "engines": { "node": "22.x" }, "scripts": { "lint": "eslint .", "format:check": "prettier --check .", "build": "npm run build --workspaces --if-present" } }`.
`.nvmrc` → `22`. `.gitignore` : `node_modules`, `dist`, `.env`, `.angular`, `*.log`, `coverage`. `.gitattributes` : `* text=auto eol=lf` (le repo a déjà affiché des warnings CRLF).

- [ ] **Step 2: Créer Prettier + ESLint flat config + tsconfig.base**

`.prettierrc.json` : `{ "singleQuote": true, "trailingComma": "all", "printWidth": 100 }`.
`eslint.config.js` : flat config avec `typescript-eslint` (`@eslint/js` recommended + `tseslint.configs.recommended`), ignores `dist/`, `node_modules/`, `.angular/`.
Dépendances dev racine : `eslint`, `@eslint/js`, `typescript-eslint`, `prettier`, `typescript`.
`tsconfig.base.json` : `compilerOptions` : `strict: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`, `baseUrl: "."`, `paths: { "@photovault/shared": ["packages/shared/src/index.ts"] }`.

- [ ] **Step 3: Vérifier lint + format**

Run: `npm install && npm run lint && npm run format:check`
Expected: les trois terminent avec code 0 (Prettier peut signaler les fichiers existants — les corriger via `npx prettier --write .` avant de rejouer).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: monorepo workspace root with eslint/prettier/tsconfig"
```

---

### Task 2: packages/shared (contrats et constantes)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/constants.spec.ts`

**Interfaces:**
- Produits: paquet `@photovault/shared` exportant :
  - `MAX_UPLOAD_BYTES: number` = `26214400` (25 Mo)
  - `ALLOWED_IMAGE_MIMES: readonly string[]` = `['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']`
  - `API_BASE_URL: string` = `'/api'`
  Consommé par apps/api (validation upload) et apps/web (affichage/refus client).

- [ ] **Step 1: Écrire le test qui échoue**

`packages/shared/src/constants.spec.ts` (Vitest) :

```ts
import { describe, expect, it } from 'vitest';
import { ALLOWED_IMAGE_MIMES, API_BASE_URL, MAX_UPLOAD_BYTES } from './constants';

describe('shared constants', () => {
  it('MAX_UPLOAD_BYTES vaut 25 Mo', () => expect(MAX_UPLOAD_BYTES).toBe(26214400));
  it('ALLOWED_IMAGE_MIMES contient jpeg/png/webp/gif/avif', () =>
    expect([...ALLOWED_IMAGE_MIMES]).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']));
  it('API_BASE_URL pointe vers /api', () => expect(API_BASE_URL).toBe('/api'));
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -w @photovault/shared`
Expected: FAIL — module `./constants` introuvable.

- [ ] **Step 3: Implémenter `constants.ts` + config du paquet**

`packages/shared/package.json` : `"name": "@photovault/shared"`, `"type": "module"`, `"main": "src/index.ts"`, scripts `test` (`vitest run`), devDeps `vitest`. `src/constants.ts` : les trois constantes typées ci-dessus. `src/index.ts` : ré-exports. Ajouter `vitest` + config minimale (`vitest.config.ts` si nécessaire).

- [ ] **Step 4: Vérifier le passage**

Run: `npm test -w @photovault/shared`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): constantes upload et base API"
```

---

### Task 3: apps/api — scaffold NestJS + endpoint de santé

**Files:**
- Create: `apps/api/` (via Nest CLI), `apps/api/src/health/health.controller.ts`, `apps/api/src/health/health.controller.spec.ts`, `apps/api/test/health.e2e-spec.ts`, `apps/api/test/jest-e2e.json`

**Interfaces:**
- Produits: app `@photovault/api` ; endpoint `GET /health` → `{ status: 'ok' }` (200) ; scripts `npm run build -w @photovault/api`, `npm test -w @photovault/api`, `npm run test:e2e -w @photovault/api` ; commande générique `npx nest g` utilisée par la suite pour les modules `auth`, `photos`, etc.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/api/src/health/health.controller.spec.ts` (Jest unitaire) : `HealthController.getStatus()` retourne `{ status: 'ok' }`.
`apps/api/test/health.e2e-spec.ts` (supertest) : `GET /health` → `expect(res.status).toBe(200)`, `expect(res.body).toEqual({ status: 'ok' })`.

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -w @photovault/api`
Expected: FAIL — `HealthController` introuvable.

- [ ] **Step 3: Scaffold NestJS + implémenter `HealthController`**

Run à la racine : `npx -y @nestjs/cli@11 new api --directory apps/api --package-manager npm --skip-git --strict` (ajuster `package.json` de l'app : `"name": "@photovault/api"`).
Implémenter `GET /health` dans `src/health/health.controller.ts`, décoré `@Controller('health')`, branché dans `app.module.ts`.

- [ ] **Step 4: Vérifier build + tests**

Run: `npm test -w @photovault/api && npm run build -w @photovault/api`
Expected: PASS, build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): scaffold NestJS avec endpoint de santé"
```

---

### Task 4: apps/web — scaffold Angular 20 SSR + Tailwind + Vitest

**Files:**
- Create: `apps/web/` (via Angular CLI), `apps/web/tailwind.config.js`, `apps/web/src/styles.css` (directives Tailwind), `apps/web/src/app/app.component.spec.ts`

**Interfaces:**
- Produits: app `@photovault/web` ; routes : `/` (landing publique), `/login`, `/register` (formulaires — contenu réel dans le plan Auth, ici placeholder + navigation) ; styles Tailwind actifs ; scripts `npm run build -w @photovault/web`, `npm run dev -w @photovault/web`, `npm test -w @photovault/web` (Vitest) ; SSR activé (`app.config.ts` avec `provideClientHydration()`).

- [ ] **Step 1: Scaffold l'application**

Run à la racine :
`npx -y @angular/cli@20 new web --directory apps/web --routing --style=css --ssr --skip-git --package-manager npm --defaults`
Renommer le package en `@photovault/web`.

- [ ] **Step 2: Ajouter Tailwind 3.4**

`npm i -D -w @photovault/web tailwindcss@3.4` ; créer `apps/web/tailwind.config.js` avec `content: ['./src/**/*.{html,ts}']` ; préfixer `src/styles.css` avec `@tailwind base; @tailwind components; @tailwind utilities;`.

- [ ] **Step 3: Écrire le test qui échoue**

`app.component.spec.ts` : le titre affiché est `PhotoVault` et un `<router-outlet>` est présent (Vitest, `TestBed`).
Ajouter la route `/login` vers un composant placeholder `LoginComponent` (titre `Connexion`) pour que le test de navigation existe.

- [ ] **Step 4: Vérifier l'échec puis implémenter**

Run: `npm test -w @photovault/web` → FAIL d'abord, puis implémenter le titre/route, → PASS.
Run: `npm run build -w @photovault/web` → build SSR OK.

- [ ] **Step 5: Configurer le testeur Vitest**

Angular 20 : builder `@angular/build:unit-test` dans `angular.json` (cible `test`), devDeps `vitest`. Vérifier `npm test -w @photovault/web` tourne avec Vitest (sinon, documenter la commande réelle dans le package script).

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): scaffold Angular 20 SSR avec Tailwind et Vitest"
```

---

### Task 5: Docker Compose (PostgreSQL, Redis, MinIO)

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `.env.guard.spec.sh` (script de vérification)

**Interfaces:**
- Produits: services `postgres` (16-alpine, port 5432, healthcheck `pg_isready`), `redis` (7-alpine, port 6379, healthcheck `redis-cli ping`), `minio` (port 9000/9001, healthcheck `mc ready local` ou curl /minio/health/ready), volumes nommés `pgdata`, `miniodata` ; `.env.example` avec `POSTGRES_USER=photovault`, `POSTGRES_PASSWORD=photovault`, `POSTGRES_DB=photovault`, `MINIO_ROOT_USER=minioadmin`, `MINIO_ROOT_PASSWORD=minioadmin`, `JWT_ACCESS_SECRET=change-me`, `JWT_REFRESH_SECRET=change-me`. Consommé par Task 6 (Prisma) et les plans suivants.

- [ ] **Step 1: Écrire le test d'infra qui échoue**

`.env.guard.spec.sh` :
```bash
#!/usr/bin/env bash
set -euo pipefail
docker compose config -q
docker compose up -d --wait
docker compose ps --format json | grep -q '"Health":"healthy"'
! git ls-files | grep -qE '(^|/)\.env$'
docker compose down -v
```

- [ ] **Step 2: Vérifier l'échec**

Run: `bash .env.guard.spec.sh`
Expected: FAIL (`docker compose config` : fichier absent).

- [ ] **Step 3: Implémenter compose + env**

Écrire `docker-compose.yml` et `.env.example` comme décrit dans Interfaces (healthchecks réels, `--wait` doit donc bloquer jusqu'à healthy). S'assurer que `.env` est bien dans `.gitignore` (Task 1).

- [ ] **Step 4: Vérifier le passage**

Run: `bash .env.guard.spec.sh`
Expected: exit 0 (services healthy, aucun `.env` versionné).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example .env.guard.spec.sh
git commit -m "chore(infra): docker compose postgres/redis/minio avec healthchecks"
```

---

### Task 6: Prisma + modèle User

**Files:**
- Create: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/**`
- Modify: `apps/api/package.json` (scripts `prisma:migrate`, `prisma:generate`), `.env.example` (variable `DATABASE_URL`)

**Interfaces:**
- Produits: modèle Prisma `User` :
  `id uuid @id @default(uuid())`, `email String @unique`, `passwordHash String`, `name String`, `createdAt DateTime @default(now())`, `deletedAt DateTime?`
  + modèle `RefreshToken` anticipé (pillé du spec) : `id`, `userId`, `tokenHash String @unique`, `expiresAt DateTime`, `rotatedAt DateTime?`, `createdAt` — relation `User`.
  Scripts : `npm run prisma:migrate -w @photovault/api` (=`prisma migrate dev`), `npm run prisma:deploy -w @photovault/api`. `DATABASE_URL=postgresql://photovault:photovault@localhost:5432/photovault` ajouté à `.env.example`. Les plans Auth/Photos consomment ces modèles.

- [ ] **Step 1: Écrire le test qui échoue**

Un test Jest `apps/api/prisma/prisma.spec.ts` : `prisma validate` via `execSync('npx prisma validate')` retourne 0, et `prisma migrate deploy` contre la base du compose crée les tables `User` et `RefreshToken` (query information_schema). Skip conditionnel si Postgres indisponible : `describe.skipIf(!process.env.CI && !process.env.DATABASE_URL)`.

- [ ] **Step 2: Vérifier l'échec**

Run: `docker compose up -d --wait; npm test -w @photovault/api`
Expected: FAIL — schéma absent.

- [ ] **Step 3: Implémenter schéma + migration**

`npm i -D -w @photovault/api prisma && npm i -w @photovault/api @prisma/client` ; `npx prisma init --datasource-provider postgresql` dans `apps/api` ; écrire les modèles ci-dessus ; `npm run prisma:migrate -w @photovault/api -- --name init` ; brancher `PrismaModule/PrismaService` dans `app.module.ts` (fourni par `PrismaService` avec `onModuleInit: $connect`, `enableShutdownHooks`).

- [ ] **Step 4: Vérifier le passage**

Run: `docker compose up -d --wait; npm run prisma:deploy -w @photovault/api; npm test -w @photovault/api`
Expected: migration appliquée sur base fraîche, tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma apps/api/package.json apps/api/src .env.example
git commit -m "feat(api): schéma Prisma User/RefreshToken + migration init"
```

---

### Task 7: CI GitHub Actions

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produits: workflow déclenché sur `pull_request` vers `main` et sur `push` de `main` : jobs `lint-format` (eslint + prettier), `build-test` (matrix : api → `npm ci`, `npm test -w @photovault/api`, `npm run build -w @photovault/api`, `prisma migrate deploy` avec service `postgres:16` ; web → `npm test -w @photovault/web`, `npm run build -w @photovault/web`), `infra` (`docker compose config -q` + vérif `.env` non versionné). Chaque job : `actions/setup-node@v4` avec `node-version-file: .nvmrc`.

- [ ] **Step 1: Écrire le test CI qui échoue**

Le test est la PR elle-même : le workflow doit passer sur la PR `feat/foundations`. Critère : tous les jobs verts + vérification `node -v` correspond à `.nvmrc` (étape `Verify Node version` : `node -v | grep -q "^v22"`).

- [ ] **Step 2: Vérifier l'échec**

Run: pousser la branche et ouvrir la PR (`gh pr create --base main`), constater l'absence/échec du workflow.
Expected: FAIL ou absent.

- [ ] **Step 3: Implémenter `ci.yml`**

Workflow comme décrit dans Interfaces (jobs `lint-format`, `build-test`, `infra` avec service postgres pour `prisma migrate deploy`, `node-version-file: .nvmrc`, étape `Verify Node version`).

- [ ] **Step 4: Vérifier le passage**

Run: `git push -u origin feat/foundations && gh pr create --title "feat: fondations monorepo + infra PhotoVault" --body "..."`, puis `gh pr checks --watch`
Expected: tous les checks verts.

- [ ] **Step 5: Commit + PR**

```bash
git add .github
git commit -m "ci: lint/build/tests/migrate sur PR"
git push
gh pr create --title "feat: fondations monorepo + infra PhotoVault"
```

---

## Suit du projet (hors de ce plan)

Plans suivants, une branche/PR chacun : **Auth** (module NestJS `auth` + écrans Angular login/register + guards/interceptors), **Upload & traitement** (MinIO, BullMQ, Sharp), **Galerie & visionneuse**, **Organisation** (albums/tags/favoris/corbeille), **Recherche & compte** + CI avancée.
