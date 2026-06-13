"""add added_by to chat participants

Revision ID: 202606130001
Revises: e36c51972d60
Create Date: 2026-06-13 00:01:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202606130001"
down_revision: Union[str, None] = "e36c51972d60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_participants",
        sa.Column("added_by", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_chat_participants_added_by_users",
        "chat_participants",
        "users",
        ["added_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_chat_participants_added_by_users",
        "chat_participants",
        type_="foreignkey",
    )
    op.drop_column("chat_participants", "added_by")
