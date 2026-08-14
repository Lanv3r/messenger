# Messenger

Work-in-progress chat app with a FastAPI/SQLModel backend, Socket.IO realtime updates, PostgreSQL storage, and a React/Vite frontend.

## Stack

- Backend: FastAPI, SQLModel, SQLAlchemy, Alembic, PostgreSQL, Socket.IO
- Frontend: React, TypeScript, Vite, Socket.IO client, Playwright smoke tests
- Auth: HttpOnly cookie containing a JWT access token
- Uploads: private Amazon S3 storage

## Frontend Color System

The app accent is **muted peach**: `#ff9d84`. It is used for the `@` user-search prefix, the `Chats` sidebar label, selected chats, outgoing message fills, composer buttons, and soft focus/hover accents.

Light theme:

- `--accent-text`: `#ff9d84`
- `--accent-fill`: `#ff9d84`
- `--accent-fill-hover`: `#f5866e`
- `--accent-soft`: `rgba(255, 157, 132, 0.18)`
- `--accent-soft-hover`: `rgba(255, 157, 132, 0.28)`
- `--accent-focus`: `rgba(255, 157, 132, 0.36)`
- `--accent-on-fill`: `#3a1c15`

Dark theme:

- `--accent-text`: `#ff9d84`
- `--accent-fill`: `#ff9d84`
- `--accent-fill-hover`: `#ffb19d`
- `--accent-soft`: `rgba(255, 157, 132, 0.14)`
- `--accent-soft-hover`: `rgba(255, 157, 132, 0.24)`
- `--accent-focus`: `rgba(255, 157, 132, 0.34)`
- `--accent-on-fill`: `#24100c`

## API Overview

Auth:

- `POST /signup`: create a user and set the auth cookie.
- `POST /login`: authenticate and set the auth cookie.
- `POST /logout`: clear the auth cookie.

Users:

- `GET /users/me/`: return the current user.
- `PATCH /users/me/`: update profile fields and avatar.
- `GET /users/username-availability`: check whether a username is available.
- `GET /users/by-username/{username}`: search/load a public user profile.

Chats:

- `GET /chats`: list current user's chats.
- `GET /chats/direct/by-user/{user_id}`: find an existing direct/self chat for a user.
- `POST /chats/group`: create a group chat.
- `GET /chats/{chat_id}/members`: list group members.
- `POST /chats/{chat_id}/members`: add group members.
- `DELETE /chats/{chat_id}/members/{user_id}`: remove a group member.
- `POST /chats/{chat_id}/read`: update read state.
- `PATCH /chats/{chat_id}/settings`: update per-user chat settings such as pinning.
- Group permission/admin endpoints live under `/chats/{chat_id}/...`.

Messages:

- `GET /chats/{chat_id}/messages`: list messages for a chat.
- `GET /chats/{chat_id}/messages/search`: search messages in a chat.
- `POST /messages/direct`: create the first direct message/chat.
- `POST /chats/{chat_id}/messages`: send a text message.
- `POST /chats/{chat_id}/messages/voice`: send a voice message.
- `POST /chats/{chat_id}/messages/files`: send one or more file attachments.
- `PATCH /messages/{message_id}`: edit text and/or attachments.
- `DELETE /messages/{message_id}`: delete for self or chat, depending on chat type and permissions.
- `POST /messages/{message_id}/pin`: pin a message.
- `DELETE /messages/{message_id}/unpin`: unpin a message.
- `GET /messages/{message_id}/copy-image`: helper endpoint for copying images from the frontend.

Realtime:

- Socket.IO is mounted together with the FastAPI app.
- The socket connection uses the same auth cookie as HTTP requests.
- Clients join chat rooms and receive message, chat, read receipt, pin/delete/edit, typing, recording, and member update events.

## Testing

Integration and smoke tests use the isolated PostgreSQL service in `compose.test.yaml`; they do not require a manually configured `TEST_DATABASE_URL`.

Prerequisites: Docker Compose, a backend virtual environment, and `npm ci` in `frontend`. Smoke tests also require the Playwright Chromium browser (`npx playwright install chromium`).

```bash
make test-integration
make test-smoke
make test
```

The smoke runner migrates the isolated database, starts the backend on `localhost:8001` and Vite on `localhost:5174`, waits for `/health`, and then runs Playwright. Set `SMOKE_BACKEND_PORT` or `SMOKE_FRONTEND_PORT` to use other free ports. GitHub Actions runs the integration and smoke jobs on every pull request and push to `main`.

## Performance Benchmarks

The backend benchmark suite measures API latency through FastAPI's in-process HTTP
client while using the same PostgreSQL engine as the application. Each small,
medium, and large workload is created in a fresh schema, setup is excluded from
timings, and the schema is removed afterward. It measures chat listing, message
listing, message search, message sending, and multipart attachment
uploads while varying chat, message, group member, attachment count, and attachment
size dimensions. Attachment storage uses an in-memory S3 stand-in so the benchmark
captures application work without external network variance.

| Workload | Group chats | Self chats | Direct chats | Target-chat messages | Members | Attachments per upload | Bytes per attachment |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Small | 10 | 1 | 20 | 50 | 3 | 2 | 16 KiB |
| Medium | 50 | 3 | 75 | 250 | 10 | 4 | 128 KiB |
| Large | 150 | 5 | 200 | 1,000 | 30 | 8 | 512 KiB |

Run the suite and save its raw samples plus min, mean, p50, p95, and max latency:

```bash
make benchmark
```

Results are written to `benchmark-results/<UTC timestamp>.json`. Keep a known-good
result as a baseline and compare a future revision with it:

```bash
./scripts/run-benchmarks.sh \
  --baseline benchmark-results/baseline.json \
  --max-regression-percent 10
```

The threshold makes the command fail when any matching operation/workload p95 is
more than the given percentage slower. For meaningful comparisons, use the same
machine, Python/PostgreSQL versions, iteration count, and otherwise-idle
environment. Increase samples when needed with `--iterations 100 --warmups 10`.

## S3 Upload Storage

Message attachments, voice notes, and profile/group avatars are stored in a private S3 bucket. FastAPI still validates and receives each upload, then writes it to S3. The database stores a stable object key, while API responses contain a short-lived signed download URL. Do not make the bucket public.

Set these values in `backend/.env` to enable it locally:

```env
S3_BUCKET=my-messenger-dev-uploads
S3_REGION=us-east-1
S3_PREFIX=messenger
S3_PRESIGNED_URL_EXPIRES_SECONDS=3600
```

The AWS SDK uses the credentials from `aws login` for local development. A deployed backend should use an IAM role that only grants `s3:GetObject` and `s3:PutObject` on `arn:aws:s3:::my-messenger-dev-uploads/messenger/*`. Tests use an in-memory S3 client and never contact AWS.

## AWS Backend Deployment

`infra/aws/backend-ec2.yaml` deploys a learning environment in `us-east-1`: one
ARM `t4g.small` EC2 instance, a private ECR repository, an isolated public VPC,
and a minimal IAM role. The instance runs PostgreSQL and the backend as separate
Docker containers. It can only read and write `messenger/*` in the configured S3
bucket and is managed through Systems Manager, so the template opens HTTP only,
not SSH.

The deployment is intentionally a low-cost development setup, not a production
architecture. It has a single application process for Socket.IO, uses HTTP while
testing, and deletes the instance database when the stack is deleted. Docker
images are automatically removed with the ECR repository on stack deletion.

Before the first deployment, start Docker Desktop and confirm `aws login` is
active. Then run:

```bash
./scripts/deploy-aws-backend.sh
```

The script validates the CloudFormation template, creates the stack, builds an
ARM image, pushes it to ECR, starts the containers through Systems Manager, and
prints the `/health` URL. Set `STACK_NAME`, `AWS_REGION`, `UPLOAD_BUCKET_NAME`,
or `S3_PREFIX` to override the defaults.

The deployed endpoint is HTTP-only, so it is suitable for checking the backend
and API during this first pass. Do not point the browser app at it yet: login
cookies need the frontend and backend served from the same HTTPS origin. A later
deployment should add a domain, HTTPS, and frontend hosting before enabling real
user logins.

## AWS Frontend And HTTPS

The HTTPS deployment uses two CloudFront distributions and a private S3 bucket:
one distribution serves the Vite build, and the other proxies the existing EC2
backend and Socket.IO endpoint. Keeping the frontend and API on separate hosts
avoids routing static assets and the API's root-level paths through the same
CloudFront behavior.

For the default `anver.net` setup, the public hosts are:

```text
messenger.anver.net
api.messenger.anver.net
```

First request a DNS-validated ACM certificate. The certificate stack remains in
`CREATE_IN_PROGRESS` until the CNAME validation records are added at the external
DNS provider.

```bash
./scripts/request-aws-messenger-certificate.sh
```

Add every printed CNAME record in Squarespace DNS. After the certificate stack is
`CREATE_COMPLETE`, build and deploy the frontend:

```bash
./scripts/deploy-aws-messenger-frontend.sh
```

The deployment script builds the frontend with
`VITE_API_URL=https://api.messenger.anver.net`, uploads it to the private S3
bucket, configures the backend for HTTPS cookies and the production CORS origin,
and prints the two CloudFront DNS CNAME targets. Add those final CNAME records in
Squarespace, then open `https://messenger.anver.net`.

CloudFront and the S3 bucket add usage-based charges. The S3 bucket is retained if
the edge stack is deleted, protecting the deploy artifacts but requiring manual
cleanup if it is no longer wanted.

## Notes

- Alembic migrations are the source of truth for database schema changes after models are updated.
- The S3 migration intentionally removes access to local uploads and does not preserve old local file or avatar references.
- The app has in-process rate limiting for normal misuse. Production deployments should still use proxy/API-gateway rate limiting for traffic spikes and DDoS-style protection.
- Permissions are enforced on the backend. Frontend UI checks should be treated only as convenience, not security.
