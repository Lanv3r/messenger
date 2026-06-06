from pydantic import BaseModel
from sqlmodel import SQLModel


class UserCreate(SQLModel):
    username: str
    password: str


class UserResponse(SQLModel):
    userId: int
    username: str


class LoginRequest(BaseModel):
    username: str
    password: str
