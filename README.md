# Gamer Review API

Production-oriented Express API for Gamer Review. The backend is independent of the UI and is prepared for MongoDB Atlas, Cloudinary, SMTP, and Vercel Functions. The workspace supplied for this task contained no React application, so no frontend files or mock interactions were changed.

## Requirements and local setup

- Node.js 24 LTS
- MongoDB Atlas (or a local MongoDB instance)
- Cloudinary credentials for image uploads
- SMTP credentials and a verified sender for account email

```powershell
npm install
Copy-Item .env.example .env
# Edit .env and configure the required values.
npm run dev
```

The server connects to MongoDB before listening. `GET /api/health` reports `ok` when the database is available and `degraded` otherwise. Do not use a production database for tests.

## Project layout

```text
api/index.js                  Vercel serverless entry point
server.js                     Local HTTP server
src/app.js                    Express app, middleware, and error responses
src/config/                   MongoDB, Cloudinary, SMTP, environment setup
src/controllers/              Request/business logic
src/middleware/               Authentication, CSRF, validation, rate limits
src/models/                   Mongoose models and indexes
src/routes/                   Modular API route definitions
src/templates/                Verification and password reset emails
src/utils/                    Shared errors, responses, token helpers
tests/                        Automated API/security tests
```

## Environment variables

Copy `.env.example` to `.env` for local development. Never commit `.env`. In production the API validates that MongoDB, JWT, Cloudinary, SMTP, sender, and frontend-origin settings are present. Both JWT secrets must be at least 32 characters; generate independent values, for example with a cryptographically secure password generator.

| Variable | Purpose |
|---|---|
| `NODE_ENV`, `PORT` | Runtime mode and local port |
| `CLIENT_URL` | Comma-separated exact frontend origins allowed by CORS |
| `API_BASE_URL` | Public API URL for frontend configuration |
| `MONGODB_URI` | Atlas connection string; keep private |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Independent signing secrets; never expose to the browser |
| `ACCESS_TOKEN_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN` | Token lifetimes, e.g. `15m`, `7d` |
| `COOKIE_NAME`, `REFRESH_COOKIE_NAME`, `COOKIE_DOMAIN`, `COOKIE_SAME_SITE` | Authentication cookie settings |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Server-side image storage |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Transactional email SMTP |
| `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` | Verified email sender |
| `PASSWORD_RESET_TOKEN_EXPIRES_MINUTES` | Password reset token lifetime |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` | General request-rate limit |
| `FRONTEND_RESET_PASSWORD_PATH` | Frontend route that receives password reset tokens |
| `ADMIN_EMAILS` | Comma-separated email allowlist for game editing and deletion |

Feature secrets are not returned by any API. SMTP errors do not include credentials, email contents, or tokens in logs. SMTP delivery is not verified until working credentials and an approved sender are configured.

## MongoDB Atlas

Create a database user with only the permissions needed for the application, configure the Atlas network access list for the deployment environment, and use the driver-generated connection string as `MONGODB_URI`. Do not use broad public network access for production. Mongoose connections are cached/reused across warm Vercel invocations. Unique indexes protect usernames, emails, one review per user/game, and each user's wishlist/favorites and review vote.

## Cloudinary

Create a Cloudinary account and configure the three Cloudinary environment values. The API accepts JPG, PNG, and WebP files up to 5 MB, checks the file signature as well as its declared MIME type, and uploads from memory to user-specific folders. It does not persist local files. Image upload responses include Cloudinary's secure URL and `publicId`; clients should submit both when creating a game or review.

## Email provider

Configure an SMTP provider, verify the sender address/domain with that provider, and set the SMTP environment values in `.env` or Vercel. Password reset emails contain absolute links built from `CLIENT_URL` plus the configured frontend route. Reset tokens are random, single-use, expiring, and stored only as SHA-256 hashes. Forgot-password responses are account-enumeration-resistant. Account registration does not require or send email verification.

## Authentication, cookies, and CSRF

- Registration creates an account without email verification. `username` is optional and generated from the email address when omitted; the frontend registration form may send only display name, email, and password.
- Login issues a short-lived access cookie and a rotating refresh cookie. Both are `HttpOnly`; refresh tokens are signed, stored hashed in MongoDB, and invalidated on rotation/logout/password reset.
- Passwords are bcrypt-hashed. Password reset and password change increment the account session version so outstanding access tokens stop working.
- Cookies use `SameSite=Lax` by default and `Secure` in production. If the sites are cross-site, set `COOKIE_SAME_SITE=none`, use HTTPS (`Secure` is then mandatory), and set a compatible cookie domain if applicable. Browsers may block third-party cookies; a same-site custom domain or same-origin reverse proxy is preferred.
- First request `GET /api/auth/csrf`, then include the returned token as `X-CSRF-Token` on unsafe requests (`POST`, `PATCH`, `DELETE`). Send cookies with `credentials: "include"` (Fetch) or `withCredentials: true` (Axios). The API checks the exact configured Origin allowlist and CSRF token.
- Do not store access or refresh tokens in localStorage. Never expose backend secrets through a `VITE_` variable.

Example:

```ts
const csrf = await fetch(`${API_BASE_URL}/auth/csrf`, { credentials: "include" }).then(r => r.json());
await fetch(`${API_BASE_URL}/auth/login`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.csrfToken },
  body: JSON.stringify({ identifier: emailOrUsername, password })
});
```

## API endpoint map

All routes are prefixed with `/api`. Successful responses use `{ success, message, data }`; list responses also include `{ pagination: { page, limit, total, totalPages } }`. Errors use `{ success: false, message, errors? }`. Internal stack traces and secrets are not included in production responses.

Interactive API documentation is available at `/api-docs` (OpenAPI JSON: `/api-docs/openapi.json`). Swagger UI uses the browser's same-origin cookie jar for authentication. To try unsafe requests from the deployed docs page, include the backend origin in `CLIENT_URL`, fetch `/api/auth/csrf`, and send the returned token as `X-CSRF-Token`; otherwise use Postman for write requests.

Example discovery request:

```powershell
curl.exe "http://localhost:5000/api/games?genre=RPG&platform=PC&minRating=8&sort=highestRated&page=1&limit=12"
```

Sanitized empty-result response:

```json
{
  "success": true,
  "message": "Games retrieved successfully",
  "data": [],
  "pagination": { "page": 1, "limit": 12, "total": 0, "totalPages": 0 }
}
```

Validation errors use the same safe shape, with field-level details:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "email", "message": "Invalid email" }]
}
```

## Frontend API mapping

The matching React application was not present in the supplied workspace; this is an integration map, not a claim that frontend calls have already been wired:

| Existing UI flow | API calls to connect |
|---|---|
| Home / discovery | `GET /games/featured`, `/games/trending`, `/games/top-rated`, `/games/new-releases`, `/reviews/recent` |
| Explore / add game | `GET /games` with search/filter/sort/page parameters; `POST /uploads/game-cover`, then `POST /games` (published immediately) |
| Game detail | `GET /games/:idOrSlug`, `GET /games/:gameId/reviews`, review vote routes, and the user's wishlist/favorite routes |
| Reviews discovery | `GET /reviews` with search, rating filters, sorting, and pagination |
| Write/edit review | `POST /uploads/review-images`, `POST /games/:gameId/reviews`, then author-only `PATCH`/`DELETE /reviews/:id` |
| Login / register / recovery | Auth routes; retain cookie credentials and use the CSRF handshake for unsafe requests |
| Wishlist / favorites | `GET`, `POST`, and `DELETE /users/me/wishlist` and `/users/me/favorites` |
| Public profile / edit profile | `GET /users/:username`, `/users/:username/reviews`, `/users/:username/favorites`, `PATCH /users/me`, and `/uploads/avatar/profile` |

The frontend should set only a public `VITE_API_BASE_URL` (for example, `https://api.example.com/api`), always use `credentials: "include"`/`withCredentials: true`, and show success only after an API success response. Do not add JWT, MongoDB, SMTP, or Cloudinary secrets to frontend configuration.

### Health and auth

| Method | Path | Access |
|---|---|---|
| GET | `/health` | Public; reports database `ok` or `degraded` |
| GET | `/auth/csrf` | Public |
| POST | `/auth/register` | Public, rate limited; accepts `displayName` or frontend field `name`; username is generated if omitted |
| POST | `/auth/login` | Public, rate limited |
| GET | `/auth/me` | Authenticated user |
| POST | `/auth/refresh` | Refresh cookie, rate limited |
| POST | `/auth/logout` | Public, idempotent |
| POST | `/auth/forgot-password` | Public, rate limited |
| POST | `/auth/reset-password` | Public, rate limited |
| PATCH | `/auth/change-password` | Authenticated user |

Register accepts `displayName`, `username`, `email`, `password`, and optional `confirmPassword`. Login accepts `identifier` (email or username), or `email`/`username`, and `password`. Passwords require 10-128 characters with lowercase, uppercase, a number, and a symbol.

### Games

| Method | Path | Access |
|---|---|---|
| GET | `/games` | Public; search/filter/sort/page |
| GET | `/games/featured` | Public |
| GET | `/games/trending` | Public; ordered by review count then recency |
| GET | `/games/top-rated` | Public; only games with reviews |
| GET | `/games/new-releases` | Public |
| GET | `/games/:idOrSlug` | Public; includes rating distribution |
| POST | `/games` | Authenticated user; publishes immediately |
| GET | `/games/genres` | Public; returns the fixed game genre list |
| GET | `/games/tags` | Public; returns game tags/genres stored in MongoDB |
| GET | `/games/platforms` | Public; returns the fixed game platform list |
| PATCH | `/games/:id` | Administrator |
| DELETE | `/games/:id` | Administrator |

`GET /games` supports `search`, `genre`, `platform`, `minRating`, `releaseYear`, `communityAdded`, `sort`, `page`, and `limit`. Sort values are `popular`, `highestRated`, `mostReviewed`, `newestReleases`, `recentlyAdded`, and `alphabetical`. Supported game tags and platforms are stored in `gametags` and `gameplatforms` collections. The default tag and platform entries are inserted idempotently at the first successful database connection; game submissions are validated against the current MongoDB catalog values. Authenticated users' new game submissions are published immediately and may receive reviews without administrator approval.

### Reviews

| Method | Path | Access |
|---|---|---|
| GET | `/reviews` | Public; default newest first |
| GET | `/reviews/recent` | Public; newest first |
| GET | `/reviews/:id` | Public |
| GET | `/games/:gameId/reviews` | Public |
| GET | `/users/:username/reviews` | Public |
| POST | `/games/:gameId/reviews` | Authenticated user |
| PATCH | `/reviews/:id` | Author only |
| DELETE | `/reviews/:id` | Author only |
| POST | `/reviews/:id/like` | Authenticated user |
| DELETE | `/reviews/:id/like` | Authenticated user |
| POST | `/reviews/:id/vote` | Authenticated user |

Create a review as JSON with pre-uploaded image references, or send `multipart/form-data` directly to `POST /games/:gameId/reviews` with `title`, `content`, `rating`, and up to 8 file fields named `images`. Multipart image files are uploaded and attached to the review in the same request.

Review listing supports `search`, `gameId`, `genre`, `platform`, `tag`, `minRating`, `maxRating`, `sort`, `page`, and `limit`. Sort values include `mostHelpful`, `mostRecent`/`newest`, `oldest`, `highestRating`, and `lowestRating`. A vote is one of `like`, `helpful`, or `notHelpful`; Like is independent from the helpfulness vote, posting the same vote toggles it off, and changing between Helpful/Not Helpful replaces the prior helpfulness vote. Users cannot vote on their own review. Ratings are recalculated from persisted reviews.

### Profiles, wishlist, favorites, and uploads

| Method | Path | Access |
|---|---|---|
| GET | `/users/:username` | Public profile and computed stats |
| GET | `/users/:username/favorites` | Public favorites |
| PATCH | `/users/me` | Verified owner |
| GET/POST/DELETE | `/users/me/wishlist[/:gameId]` | Verified owner |
| GET/POST/DELETE | `/users/me/favorites[/:gameId]` | Verified owner |
| POST | `/uploads/avatar` | Authenticated user; `image` field |
| POST | `/uploads/avatar/profile` | Authenticated user; upload and save avatar |
| POST | `/uploads/game-cover` | Authenticated user; `image` field |
| POST | `/uploads/game-banner` | Authenticated user; `image` field |
| POST | `/uploads/screenshots` | Authenticated user; repeated `images` fields |
| POST | `/uploads/review-images` | Authenticated user; repeated `images` fields |

Wishlist is private and cannot be requested by another user's ID. Favorites and wishlist are independent, idempotent collections. Profile updates accept only display name, username, bio, and favorite tags; they cannot set roles or authentication fields. Public profile output does not include email or private account data.

## Vercel deployment

1. Create a Vercel project from the repository and set **Root Directory** to this backend directory (`ProjectWeb_Backend` for this workspace).
2. The checked-in `vercel.json` routes requests through `api/index.js`, which exports the Express app as a serverless handler. No persistent listener is started in the function.
3. Add every production setting from `.env.example` in Vercel **Project → Settings → Environment Variables**. Set `NODE_ENV=production`, an exact `CLIENT_URL`, secure cookie values, MongoDB, Cloudinary, SMTP, and two distinct 32+ character JWT secrets. Do not prefix secrets with `VITE_`.
4. Configure the Atlas network access needed for Vercel and verify SMTP sender/domain configuration.
5. Redeploy after changing environment variables. Check `/api/health` after deployment.

This API uses Express's in-process rate limiter. For deployments with many serverless instances, also configure Vercel Firewall/WAF or another shared edge rate limit because in-memory counters are per instance and reset on cold starts.

## Testing and lint

```powershell
npm test
npm run lint
```

For copy-ready request bodies in a JSON data file, see
[`POSTMAN_API_TESTS.txt`](./POSTMAN_API_TESTS.txt). It contains JSON bodies,
bodyless requests, multipart upload field instructions, and Postman setup
notes. An importable Postman collection is available as
[`Gamer-Review-API.postman_collection.json`](./Gamer-Review-API.postman_collection.json).

The checked-in test suite covers health/degraded behavior, CSRF and CORS rejection, authentication guards, API errors, token hashing, and image signature checks without a production database. End-to-end persistence, email delivery, Cloudinary upload, cookie rotation, and moderation workflows require a disposable MongoDB test database plus test SMTP/Cloudinary credentials; no such credentials were supplied, so those external-service flows have not been represented as verified.

## Security and troubleshooting

- `503` at `/api/health`: MongoDB is disconnected or `MONGODB_URI`/Atlas network access is not configured.
- `403 CSRF_INVALID`: obtain a fresh token at `/api/auth/csrf` and send it with the matching cookies.
- `403 Request origin is not allowed`: add the exact frontend origin (scheme and port included) to `CLIENT_URL`.
- Upload configuration or delivery failures are returned as safe API errors. Check server-side environment settings without logging secrets.
- Never use permissive wildcard CORS with credentialed cookies. Rotate any credential that has ever been committed or exposed; `.gitignore` cannot remove a secret from Git history.
