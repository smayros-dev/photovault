# PRD — PhotoVault

**Date :** 2026-10-23
**Statut :** approuvé
**Objectif :** application web de gestion personnelle de photos, inspirée de Google Photos, conçue comme projet portfolio pour approfondir Angular moderne (Signals, RxJS, routing avancé, formulaires typés, API HTTP, performances, sécurité, tests, SSR).

---

## 1. Contexte et objectifs

PhotoVault est une application multi-composants destinée à un usage personnel : importer, organiser, rechercher et visualiser ses photos en toute confidentialité.

**Critères de succès**
- Portfolio démontrable : application complète, testée, documentée, déployable via Docker Compose.
- Couverture des axes Angular modernes : Signals pour l'état, RxJS pour les flux asynchrones, routing avancé, formulaires typés, SSR là où cela a du sens.
- Sécurité réelle : accès strictement limité au propriétaire des photos.
- Performances stables à 10 000+ photos (grille virtuelle, pagination par curseur).

## 2. Périmètre

### 2.1 Fonctionnel (v1)

| Bloc | Contenu |
|------|---------|
| **Bibliothèque photo** | Galerie chronologique, grille responsive, vue plein écran, sélection multiple, navigation au clavier, chargement progressif |
| **Import et stockage** | Upload multiple, glisser-déposer, aperçu local, progression, annulation, détection de doublons, génération de miniatures |
| **Organisation** | Albums, favoris, tags, archives, corbeille, dates de prise de vue, filtres combinés |
| **Recherche intelligente** | Recherche par nom, date, type, album et tag ; architecture extensible (lieu, contenu visuel plus tard) |
| **Compte et confidentialité** | Connexion, profil, sessions sécurisées, suppression de compte, accès strictement limité au propriétaire |

### 2.2 Hors périmètre (v1)

Partage public, collaboration temps réel, reconnaissance faciale, albums automatiques par IA, applications mobiles natives. L'architecture doit pouvoir les accueillir ultérieurement.

## 3. Stack technique

| Couche | Technologie | Rôle |
|--------|-------------|------|
| Frontend | Angular 20+, standalone | Interface et navigation |
| SSR | Angular SSR, coquille publique (landing, login) rendue serveur ; galerie (derrière auth) en client | Perf/SEO de l'accueil |
| Réactivité | Signals + RxJS | État local et flux asynchrones |
| UI | Angular CDK + Tailwind | Grilles (virtual scroll), overlays, drag-and-drop |
| Backend | NestJS, monolithe modulaire | API REST et logique métier |
| Base de données | PostgreSQL | Métadonnées uniquement (jamais de binaire) |
| ORM | Prisma | Schéma et migrations |
| Stockage fichiers | MinIO en local, S3 en production | Originaux et dérivés, noms internes générés par le serveur |
| Traitement images | Sharp, asynchrone (file BullMQ + Redis) | Miniatures et dérivés optimisés |
| Authentification | Access JWT court + refresh token rotatif en cookie httpOnly | Identité et contrôle d'accès |
| Tests | Vitest (Angular), Jest (NestJS), Testing Library, Playwright | Unitaires, composants, parcours |
| Dépôt | Monorepo : `apps/web`, `apps/api`, `packages/shared` | Code partagé (types/contrats) |
| Déploiement | Docker Compose (+ CI GitHub Actions) | Environnement reproductible |

## 4. Architecture

### 4.1 Décision d'architecture

- **Backend : monolithe modulaire** NestJS (pas de microservices) — plus simple à développer et tester, séparation claire des responsabilités par module.
- **Frontend : application Angular organisée par fonctionnalité.**
- **PostgreSQL ne stocke pas de fichiers binaires** : uniquement métadonnées et clés de stockage. Les binaires vivent dans MinIO/S3 sous des noms internes générés côté serveur.

### 4.2 Frontend

- Structure : `src/app/features/{auth,gallery,upload,albums,search,account}`, `core/` (interceptors, guards, services transverses), `shared/` (UI générique).
- État : Signals pour l'état local et les caches partagés, `computed` dérivés ; RxJS pour les flux HTTP, debounce de recherche et annulation (`switchMap`).
- SSR : coquille publique rendue et hydratée côté serveur ; routes authentifiées en rendu client.
- UI : CDK virtual scrolling (grille), overlay (plein écran), drag-and-drop (upload).

### 4.3 Backend

- Modules : `auth`, `users`, `photos`, `albums`, `tags`, `search`, `processing` — chacun avec controller + service + DTOs.
- Contrôle d'accès : `JwtAuthGuard` + résolution systématique de `userId` depuis le token (aucun accès par ID sans vérification de propriété).
- **Flux d'upload** :
  1. `POST /photos` (multipart) → écriture MinIO sous clé générée `userId/uuid.ext`.
  2. Création de l'enregistrement Prisma (`status: processing`).
  3. Job BullMQ (Redis) → Sharp génère miniature + dérivés → `status: ready` (client notifié par polling léger, 2 s, uniquement tant que des photos sont en `processing`).
  4. Réservation de l'emplacement dans la grille immédiatement (affichage `processing`).
- Détection de doublons côté serveur (hash SHA-256 du fichier) : si un doublon existe déjà pour le même utilisateur, l'upload est refusé avec l'erreur `DUPLICATE` et la photo existante renvoyée dans la réponse.

### 4.4 Modèle de données (Prisma)

- `User` : id, email, passwordHash, nom, createdAt, deletedAt (suppression en 2 temps).
- `Photo` : id, userId, storageKey, thumbnailKey, width, height, format, size, mime, takenAt (EXIF), uploadedAt, title, status (`processing|ready|failed`), favorite, archived, deletedAt (corbeille, purge > 30 j).
- `Album` : id, userId, name, description, coverPhotoId, createdAt ; pivot `AlbumPhoto` (position).
- `Tag` : id, userId, name (unique par utilisateur) ; pivot `PhotoTag`.
- `RefreshToken` : id, userId, tokenHash, expiresAt, rotatedAt (rotation + révocation).
- Index : `(userId, takenAt DESC)`, `(userId, deletedAt)`, trigram sur `title`.

### 4.5 API (aperçu)

- `POST /auth/register|login|refresh|logout`, `GET/PATCH /users/me`, `DELETE /users/me`
- `POST /photos` (upload), `GET /photos` (curseur + filtres), `GET /photos/:id`, `PATCH /photos/:id`, `DELETE /photos/:id`, restauration corbeille
- `GET /photos/:id/file?variant=thumb|medium|original` (URL signée à durée courte)
- CRUD `albums`, `tags` ; `GET /search?q=&from=&to=&type=&album=&tag=`

## 5. Parcours clés

1. **Upload** : drag & drop → aperçu local (objectURL) → file d'attente avec progression (XHR) → annulation → état `processing` dans la grille → passage à `ready`.
2. **Galerie** : grille virtuelle chronologique par mois, pagination par curseur, sélection multiple (clic + shift), navigation clavier (flèches, Entrée, Échap), plein écran + diaporama.
3. **Organisation** : albums/tags/favoris/archives/corbeille avec mises à jour optimistes via signals.
4. **Recherche** : debounce 300 ms → combinaison date/type/album/tag/texte → un seul appel HTTP (annulation du précédent).
5. **Compte** : profil, changement de mot de passe, liste/révocation des sessions, suppression de compte (cascade + purge du stockage).

## 6. Sécurité

- Access JWT ~15 min en mémoire ; refresh ~7 j en cookie `HttpOnly; Secure; SameSite=Strict`, rotation à chaque usage, détection de réutilisation → révocation de la famille.
- Rate limiting (Throttler) sur login et upload ; validation class-validator ; whitelist d'extensions images ; taille max 25 Mo/fichier.
- URLs de fichiers signées à durée courte (jamais d'accès direct aux clés MinIO).
- Helmet, CORS strict, aucun secret côté client, configuration par variables d'environnement.

## 7. Performances

- Grille virtuelle + `trackBy`, images `loading="lazy"`, `srcset` (3 dérivés), `NgOptimizedImage`.
- Pagination curseur côté API (pas d'OFFSET), index alignés sur les requêtes.
- Zéro appel HTTP redondant : filtres → `switchMap` annule la requête précédente.
- Budgets : LCP < 2,5 s sur la landing SSR ; mémoire stable à 10 000+ photos.

## 8. Tests

- **Unitaires** : services/guards/pipes/interceptors Angular (Vitest) ; logique métier NestJS (Jest).
- **Composants** : Testing Library sur upload, grille de sélection, formulaire login.
- **e2e Playwright** : login → upload → galerie → album → recherche ; parcours corbeille.

## 9. CI/CD et exploitation

- GitHub Actions : lint (ESLint + Prettier), typecheck, tests, build, validation `docker compose config`.
- Docker Compose local : postgres, redis, minio, api, web ; migrations Prisma au démarrage.

## 10. Évolution future

Le périmètre hors v1 (partage, collaboration, IA, lieu/visuel, mobile) s'appuiera sur : file de traitement déjà en place, modèle `Photo` extensible (colonnes géo/analyses), modules NestJS additionnels sans casser les contrats `packages/shared`.
