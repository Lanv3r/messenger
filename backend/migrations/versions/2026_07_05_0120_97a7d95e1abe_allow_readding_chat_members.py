"""allow readding chat members

Revision ID: 97a7d95e1abe
Revises: 45534c360b73
Create Date: 2026-07-05 01:20:54.003086+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '97a7d95e1abe'
down_revision: Union[str, None] = '45534c360b73'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        op.f("uq_chat_participants_chat_id_user_id"),
        "chat_participants",
        type_="unique",
    )
    op.create_index(
        "uq_chat_participants_active_chat_user",
        "chat_participants",
        ["chat_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("left_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_chat_participants_active_chat_user",
        table_name="chat_participants",
        postgresql_where=sa.text("left_at IS NULL"),
    )
    op.create_unique_constraint(
        op.f("uq_chat_participants_chat_id_user_id"),
        "chat_participants",
        ["chat_id", "user_id"],
        postgresql_nulls_not_distinct=False,
    )
