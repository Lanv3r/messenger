# Messenger

Work-in-progress chat app with a FastAPI/SQLModel backend, Socket.IO realtime updates, PostgreSQL storage, and a React/Vite frontend.

## Stack

- Backend: FastAPI, SQLModel, SQLAlchemy, Alembic, PostgreSQL, Socket.IO
- Frontend: React, TypeScript, Vite, Socket.IO client, Playwright smoke tests
- Auth: HttpOnly cookie containing a JWT access token
- Uploads: local filesystem storage mounted at `/uploads`

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

## Notes

- Alembic migrations are the source of truth for database schema changes after models are updated.
- Local uploads are useful for development, but production should use object storage or another durable upload service.
- The app has in-process rate limiting for normal misuse. Production deployments should still use proxy/API-gateway rate limiting for traffic spikes and DDoS-style protection.
- Permissions are enforced on the backend. Frontend UI checks should be treated only as convenience, not security.
