import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import socket_handlers  # noqa: F401
from app.routers import auth, chats, messages, users
from app.settings import settings
from app.socket import sio
from app.upload_constants import UPLOADS_DIR

# FastAPI app
fastapi_app = FastAPI()
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
fastapi_app.include_router(auth.router)
fastapi_app.include_router(chats.router)
fastapi_app.include_router(messages.router)
fastapi_app.include_router(users.router)


@fastapi_app.get("/health", include_in_schema=False)
def health_check():
    return {"ok": True}


UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
fastapi_app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


# Final ASGI app: Socket.IO + FastAPI
app = socketio.ASGIApp(sio, fastapi_app)
