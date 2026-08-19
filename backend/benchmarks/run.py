#!/usr/bin/env python3
"""Run repeatable in-process HTTP benchmarks with isolated PostgreSQL data."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import platform
import statistics
import subprocess
import sys
import time
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from unittest.mock import patch
from uuid import uuid4

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_RESULTS_DIR = BACKEND_DIR.parent / "benchmark-results"


@dataclass(frozen=True)
class Workload:
    name: str
    group_chat_count: int
    self_chat_count: int
    direct_chat_count: int
    deleted_last_message_percent: float
    messages_in_target_chat: int
    reply_message_percent: float
    attachment_message_percent: float
    attachments_per_message: int
    member_count: int
    attachment_count: int
    attachment_bytes: int


WORKLOADS = (
    Workload(
        "small",
        group_chat_count=10,
        self_chat_count=1,
        direct_chat_count=20,
        deleted_last_message_percent=2,
        messages_in_target_chat=50,
        reply_message_percent=10,
        attachment_message_percent=10,
        attachments_per_message=4,
        member_count=3,
        attachment_count=2,
        attachment_bytes=16 * 1024,
    ),
    Workload(
        "medium",
        group_chat_count=50,
        self_chat_count=3,
        direct_chat_count=75,
        deleted_last_message_percent=2,
        messages_in_target_chat=250,
        reply_message_percent=10,
        attachment_message_percent=10,
        attachments_per_message=4,
        member_count=10,
        attachment_count=4,
        attachment_bytes=128 * 1024,
    ),
    Workload(
        "large",
        group_chat_count=150,
        self_chat_count=5,
        direct_chat_count=200,
        deleted_last_message_percent=2,
        messages_in_target_chat=1000,
        reply_message_percent=10,
        attachment_message_percent=10,
        attachments_per_message=4,
        member_count=30,
        attachment_count=8,
        attachment_bytes=512 * 1024,
    ),
)


def percentile(samples: list[float], percentile_value: float) -> float:
    """Return the nearest-rank percentile commonly used for latency SLOs."""
    if not samples:
        raise ValueError("at least one sample is required")
    if not 0 < percentile_value <= 100:
        raise ValueError("percentile must be greater than 0 and at most 100")
    ordered = sorted(samples)
    rank = math.ceil((percentile_value / 100) * len(ordered))
    return ordered[rank - 1]


def evenly_spaced_indexes(item_count: int, selected_count: int) -> list[int]:
    if item_count < 1:
        raise ValueError("item_count must be positive")
    if not 1 <= selected_count <= item_count:
        raise ValueError("selected_count must be between 1 and item_count")
    if selected_count == 1:
        return [item_count // 2]
    return [
        round(index * (item_count - 1) / (selected_count - 1))
        for index in range(selected_count)
    ]


def percentage_indexes(
    item_count: int,
    percentage: float,
    phase: float = 0.5,
) -> list[int]:
    if item_count < 0:
        raise ValueError("item_count cannot be negative")
    if not 0 <= percentage <= 100:
        raise ValueError("percentage must be between 0 and 100")
    if not 0 <= phase < 1:
        raise ValueError("phase must be at least 0 and less than 1")

    selected_count = round(item_count * percentage / 100)
    if selected_count == 0:
        return []

    return [
        min(item_count - 1, int((index + phase) * item_count / selected_count))
        for index in range(selected_count)
    ]


def summarize(samples_ms: list[float]) -> dict[str, Any]:
    if not samples_ms:
        raise ValueError("at least one sample is required")
    return {
        "sample_count": len(samples_ms),
        "min_ms": round(min(samples_ms), 3),
        "mean_ms": round(statistics.fmean(samples_ms), 3),
        "p50_ms": round(percentile(samples_ms, 50), 3),
        "p95_ms": round(percentile(samples_ms, 95), 3),
        "max_ms": round(max(samples_ms), 3),
        "samples_ms": [round(sample, 3) for sample in samples_ms],
    }


def result_key(result: dict[str, Any]) -> tuple[str, str]:
    return result["operation"], result["workload"]


def compare_results(
    current: list[dict[str, Any]], baseline: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    baseline_by_key = {result_key(item): item for item in baseline}
    comparisons = []
    for item in current:
        previous = baseline_by_key.get(result_key(item))
        if previous is None:
            continue
        baseline_p95 = float(previous["latency"]["p95_ms"])
        current_p95 = float(item["latency"]["p95_ms"])
        delta_percent = (
            ((current_p95 - baseline_p95) / baseline_p95) * 100
            if baseline_p95 > 0
            else 0.0
        )
        comparisons.append(
            {
                "operation": item["operation"],
                "workload": item["workload"],
                "baseline_p95_ms": baseline_p95,
                "current_p95_ms": current_p95,
                "delta_percent": round(delta_percent, 2),
            }
        )
    return comparisons


def git_revision() -> str | None:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=BACKEND_DIR.parent,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None


def time_operation(
    operation: Callable[[int], Any], warmups: int, iterations: int
) -> dict[str, Any]:
    for index in range(warmups):
        operation(index)
    samples_ms = []
    for index in range(iterations):
        started = time.perf_counter_ns()
        operation(index)
        samples_ms.append((time.perf_counter_ns() - started) / 1_000_000)
    return summarize(samples_ms)


def require_success(response: Any, operation: str) -> None:
    if not 200 <= response.status_code < 300:
        raise RuntimeError(
            f"{operation} returned HTTP {response.status_code}: {response.text}"
        )


def run_workload(
    workload: Workload,
    database_url: str,
    warmups: int,
    iterations: int,
) -> list[dict[str, Any]]:
    # Imports happen after the launcher supplies required application settings.
    from fastapi.testclient import TestClient
    from sqlalchemy import text
    from sqlmodel import SQLModel, Session, create_engine

    from app import dependencies
    from app.db import get_session
    from app.dependencies import create_user_session
    from app.main import fastapi_app
    from app.models import (
        Chat,
        ChatMemberPermissions,
        ChatParticipant,
        Message,
        MessageUserState,
        User,
    )
    from app.permissions import SYSTEM_ROLE_DEFAULTS
    from app.rate_limit import reset_all_rate_limiters
    from app.services import storage
    from app.socket import sio

    schema = f"benchmark_{uuid4().hex}"
    admin_engine = create_engine(database_url, echo=False)
    with admin_engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    schema_engine = create_engine(
        database_url,
        echo=False,
        connect_args={"options": f"-csearch_path={schema}"},
    )
    SQLModel.metadata.create_all(schema_engine)

    try:
        with Session(schema_engine) as session:
            group_users = [
                User(
                    username=f"bench_{workload.name}_{index}",
                    first_name=f"Benchmark {index}",
                    password_hash="benchmark-not-used",
                )
                for index in range(workload.member_count)
            ]
            direct_users = [
                User(
                    username=f"bench_{workload.name}_direct_{index}",
                    first_name=f"Direct peer {index}",
                    password_hash="benchmark-not-used",
                )
                for index in range(workload.direct_chat_count)
            ]
            session.add_all([*group_users, *direct_users])
            session.flush()
            owner = group_users[0]
            if owner.id is None:
                raise RuntimeError("benchmark owner was not created")
            owner_id = owner.id

            target_chat_id = None
            deletion_candidates: list[tuple[Chat, int]] = []
            expected_fallback_message_id_by_chat: dict[int, int] = {}
            for chat_index in range(workload.group_chat_count):
                chat = Chat(type="group", title=f"Benchmark chat {chat_index}")
                session.add(chat)
                session.flush()
                if chat.id is None:
                    raise RuntimeError("benchmark chat was not created")
                if target_chat_id is None:
                    target_chat_id = chat.id
                session.add(
                    ChatMemberPermissions(
                        chat_id=chat.id,
                        permissions=SYSTEM_ROLE_DEFAULTS["member"].copy(),
                    )
                )
                for user_index, user in enumerate(group_users):
                    if user.id is None:
                        raise RuntimeError("benchmark member was not created")
                    session.add(
                        ChatParticipant(
                            chat_id=chat.id,
                            user_id=user.id,
                            role="owner" if user_index == 0 else "member",
                        )
                    )

                message_count = (
                    workload.messages_in_target_chat if chat_index == 0 else 1
                )
                reply_message_indexes = (
                    set(
                        percentage_indexes(
                            message_count,
                            workload.reply_message_percent,
                            phase=0.8,
                        )
                    )
                    if chat_index == 0
                    else set()
                )
                attachment_message_indexes = (
                    set(
                        percentage_indexes(
                            message_count,
                            workload.attachment_message_percent,
                            phase=0.4,
                        )
                    )
                    if chat_index == 0
                    else set()
                )
                target_chat_messages = []
                for message_index in range(message_count):
                    sender_id = group_users[message_index % len(group_users)].id
                    if sender_id is None:
                        raise RuntimeError("benchmark sender was not created")
                    is_attachment_message = message_index in attachment_message_indexes
                    message = Message(
                        chat_id=chat.id,
                        sender_id=sender_id,
                        content=(
                            f"benchmark needle message {message_index}"
                            if message_index % 10 == 0
                            else f"benchmark message {message_index}"
                        ),
                        message_type="album" if is_attachment_message else "text",
                        metadata=(
                            {
                                "attachments": [
                                    {
                                        "storage_key": (
                                            f"files/benchmark-{message_index}-"
                                            f"{attachment_index}.png"
                                        ),
                                        "original_name": (
                                            f"attachment-{attachment_index}.png"
                                        ),
                                        "mime_type": "image/png",
                                        "size_bytes": workload.attachment_bytes,
                                        "message_type": "image",
                                    }
                                    for attachment_index in range(
                                        workload.attachments_per_message
                                    )
                                ]
                            }
                            if is_attachment_message
                            else {}
                        ),
                    )
                    session.add(message)
                    target_chat_messages.append(message)
                session.flush()

                if chat_index == 0 and reply_message_indexes:
                    ordered_reply_indexes = sorted(reply_message_indexes)
                    deleted_reply_target_count = max(
                        1,
                        round(len(ordered_reply_indexes) * 20 / 100),
                    )
                    deleted_reply_ordinals = {
                        reply_ordinal: deletion_index
                        for deletion_index, reply_ordinal in enumerate(
                            evenly_spaced_indexes(
                                len(ordered_reply_indexes),
                                deleted_reply_target_count,
                            )
                        )
                    }
                    for reply_ordinal, message_index in enumerate(
                        ordered_reply_indexes
                    ):
                        if message_index == 0:
                            continue
                        message = target_chat_messages[message_index]
                        reply_target = target_chat_messages[message_index - 1]
                        if reply_target.id is None:
                            raise RuntimeError("benchmark reply target has no ID")
                        message.reply_to_message_id = reply_target.id

                        deletion_index = deleted_reply_ordinals.get(reply_ordinal)
                        if deletion_index is None:
                            continue
                        if deletion_index % 2 == 0:
                            reply_target.deleted_at = datetime.now(timezone.utc)
                            reply_target.deleted_by = reply_target.sender_id
                        else:
                            session.add(
                                MessageUserState(
                                    message_id=reply_target.id,
                                    user_id=owner_id,
                                    deleted_at=datetime.now(timezone.utc),
                                )
                            )

                last_message = (
                    target_chat_messages[-1] if target_chat_messages else None
                )
                if last_message is not None:
                    chat.last_message_id = last_message.id
                    if chat_index != 0:
                        fallback_sender_id = group_users[1].id
                        if fallback_sender_id is None:
                            raise RuntimeError("benchmark sender was not created")
                        deletion_candidates.append((chat, fallback_sender_id))

            for chat_index in range(workload.self_chat_count):
                chat = Chat(type="self", title="Saved Messages")
                session.add(chat)
                session.flush()
                if chat.id is None:
                    raise RuntimeError("benchmark self chat was not created")
                session.add(
                    ChatParticipant(
                        chat_id=chat.id,
                        user_id=owner_id,
                        role="owner",
                    )
                )
                message = Message(
                    chat_id=chat.id,
                    sender_id=owner_id,
                    content=f"benchmark saved message {chat_index}",
                )
                session.add(message)
                session.flush()
                chat.last_message_id = message.id
                deletion_candidates.append((chat, owner_id))

            for chat_index, direct_user in enumerate(direct_users):
                if direct_user.id is None:
                    raise RuntimeError("benchmark direct user was not created")
                chat = Chat(type="direct")
                session.add(chat)
                session.flush()
                if chat.id is None:
                    raise RuntimeError("benchmark direct chat was not created")
                session.add_all(
                    [
                        ChatParticipant(
                            chat_id=chat.id,
                            user_id=owner_id,
                            role="member",
                        ),
                        ChatParticipant(
                            chat_id=chat.id,
                            user_id=direct_user.id,
                            role="member",
                        ),
                    ]
                )
                message = Message(
                    chat_id=chat.id,
                    sender_id=(direct_user.id if chat_index % 2 == 0 else owner_id),
                    content=f"benchmark direct message {chat_index}",
                )
                session.add(message)
                session.flush()
                chat.last_message_id = message.id

                deletion_candidates.append((chat, direct_user.id))

            total_chat_count = (
                workload.group_chat_count
                + workload.self_chat_count
                + workload.direct_chat_count
            )
            deleted_last_message_count = max(
                1,
                round(total_chat_count * workload.deleted_last_message_percent / 100),
            )
            selected_candidate_indexes = evenly_spaced_indexes(
                len(deletion_candidates),
                deleted_last_message_count,
            )
            deleted_at = datetime.now(timezone.utc)

            for deletion_index, candidate_index in enumerate(
                selected_candidate_indexes
            ):
                chat, sender_id = deletion_candidates[candidate_index]
                if chat.id is None or chat.last_message_id is None:
                    raise RuntimeError("benchmark deletion candidate is invalid")

                expected_fallback_message_id_by_chat[chat.id] = chat.last_message_id
                deleted_last_message = Message(
                    chat_id=chat.id,
                    sender_id=sender_id,
                    content=f"benchmark deleted last message {deletion_index}",
                )
                session.add(deleted_last_message)
                session.flush()
                if deleted_last_message.id is None:
                    raise RuntimeError("benchmark deleted message was not created")

                chat.last_message_id = deleted_last_message.id
                if deletion_index % 2 == 0:
                    deleted_last_message.deleted_at = deleted_at
                    deleted_last_message.deleted_by = sender_id
                else:
                    session.add(
                        MessageUserState(
                            message_id=deleted_last_message.id,
                            user_id=owner_id,
                            deleted_at=deleted_at,
                        )
                    )
            session.commit()

        if target_chat_id is None:
            raise RuntimeError("target benchmark chat was not created")

        def override_get_session():
            with Session(schema_engine) as session:
                yield session

        async def noop_emit(*_args: Any, **_kwargs: Any) -> None:
            return None

        class InMemoryS3Client:
            def put_object(self, **_kwargs: Any) -> None:
                return None

            def generate_presigned_url(self, _client_method: str, **kwargs: Any) -> str:
                return f"https://example.test/{kwargs['Params']['Key']}"

        class InMemoryRedisClient:
            def __init__(self) -> None:
                self.values: dict[str, str] = {}

            async def set(self, name: str, value: str, **_kwargs: Any) -> bool:
                self.values[name] = value
                return True

            async def getex(self, name: str, **_kwargs: Any) -> str | None:
                return self.values.get(name)

            async def delete(self, name: str) -> int:
                return 1 if self.values.pop(name, None) is not None else 0

        fastapi_app.dependency_overrides[get_session] = override_get_session
        reset_all_rate_limiters()
        benchmark_redis = InMemoryRedisClient()

        with (
            patch.object(dependencies, "redis_client", benchmark_redis),
            patch.object(sio, "emit", noop_emit),
            patch.object(
                storage,
                "_get_s3_client",
                return_value=InMemoryS3Client(),
            ),
            TestClient(fastapi_app) as client,
        ):
            token = asyncio.run(create_user_session(owner_id))
            client.cookies.set("token", token)

            seeded_chats = []
            chat_cursor = None
            while True:
                chat_params = {"limit": 100}
                if chat_cursor is not None:
                    chat_params["before_id"] = chat_cursor
                seeded_chats_response = client.get("/chats", params=chat_params)
                require_success(seeded_chats_response, "validate_seeded_chats")
                chat_page = seeded_chats_response.json()
                seeded_chats.extend(chat_page)
                if len(chat_page) < 100:
                    break
                chat_cursor = chat_page[-1]["id"]

            actual_chat_counts = Counter(chat["type"] for chat in seeded_chats)
            expected_chat_counts = {
                "group": workload.group_chat_count,
                "self": workload.self_chat_count,
                "direct": workload.direct_chat_count,
            }
            if actual_chat_counts != expected_chat_counts:
                raise RuntimeError(
                    "seeded chat mix was not returned by /chats: "
                    f"expected {expected_chat_counts}, got {dict(actual_chat_counts)}"
                )

            seeded_chats_by_id = {chat["id"]: chat for chat in seeded_chats}
            for (
                chat_id,
                expected_message_id,
            ) in expected_fallback_message_id_by_chat.items():
                actual_message_id = seeded_chats_by_id[chat_id]["last_message_id"]
                if actual_message_id != expected_message_id:
                    raise RuntimeError(
                        "deleted last-message fallback was not returned for "
                        f"chat {chat_id}: expected {expected_message_id}, "
                        f"got {actual_message_id}"
                    )

            first_message_page_response = client.get(
                f"/chats/{target_chat_id}/messages",
                params={"limit": 25},
            )
            require_success(first_message_page_response, "validate_message_page")
            first_message_page = first_message_page_response.json()
            if len(first_message_page) != 25:
                raise RuntimeError("benchmark target chat did not fill a message page")
            if not any(
                message["reply_to_message_id"] is not None
                for message in first_message_page
            ):
                raise RuntimeError("benchmark message page contains no replies")
            if not any(
                message.get("reply_to", {}).get("message_type") == "deleted"
                for message in first_message_page
                if message.get("reply_to") is not None
            ):
                raise RuntimeError(
                    "benchmark message page contains no deleted reply preview"
                )
            if not any(
                len(message.get("metadata", {}).get("attachments", []))
                == workload.attachments_per_message
                for message in first_message_page
            ):
                raise RuntimeError(
                    "benchmark message page contains no configured attachment album"
                )
            older_message_cursor = first_message_page[0]["id"]

            older_message_page_response = client.get(
                f"/chats/{target_chat_id}/messages",
                params={"limit": 25, "before_id": older_message_cursor},
            )
            require_success(
                older_message_page_response,
                "validate_older_message_page",
            )
            if not older_message_page_response.json():
                raise RuntimeError("benchmark target chat has no older message page")

            first_chat_page_response = client.get("/chats", params={"limit": 25})
            require_success(first_chat_page_response, "validate_chat_page")
            first_chat_page = first_chat_page_response.json()
            if len(first_chat_page) != 25:
                raise RuntimeError("benchmark workload did not fill a chat page")
            older_chat_cursor = first_chat_page[-1]["id"]

            older_chat_page_response = client.get(
                "/chats",
                params={"limit": 25, "before_id": older_chat_cursor},
            )
            require_success(older_chat_page_response, "validate_older_chat_page")
            if not older_chat_page_response.json():
                raise RuntimeError("benchmark workload has no older chat page")

            def get_chats(_index: int) -> None:
                require_success(
                    client.get("/chats", params={"limit": 25}),
                    "list_chats",
                )

            def get_older_chats(_index: int) -> None:
                require_success(
                    client.get(
                        "/chats",
                        params={"limit": 25, "before_id": older_chat_cursor},
                    ),
                    "list_chats_older",
                )

            def get_messages(_index: int) -> None:
                require_success(
                    client.get(
                        f"/chats/{target_chat_id}/messages",
                        params={"limit": 25},
                    ),
                    "list_messages",
                )

            def get_older_messages(_index: int) -> None:
                require_success(
                    client.get(
                        f"/chats/{target_chat_id}/messages",
                        params={
                            "limit": 25,
                            "before_id": older_message_cursor,
                        },
                    ),
                    "list_messages_older",
                )

            def search_messages(_index: int) -> None:
                require_success(
                    client.get(
                        f"/chats/{target_chat_id}/messages/search",
                        params={"query": "needle"},
                    ),
                    "search_messages",
                )

            def send_message(index: int) -> None:
                require_success(
                    client.post(
                        f"/chats/{target_chat_id}/messages",
                        json={"content": f"timed benchmark message {index}"},
                    ),
                    "send_message",
                )

            attachment_content = b"x" * workload.attachment_bytes

            def send_attachments(index: int) -> None:
                files = [
                    (
                        "files",
                        (
                            f"benchmark-{index}-{file_index}.png",
                            attachment_content,
                            "image/png",
                        ),
                    )
                    for file_index in range(workload.attachment_count)
                ]
                require_success(
                    client.post(
                        f"/chats/{target_chat_id}/messages/files",
                        data={"content": f"attachment benchmark {index}"},
                        files=files,
                    ),
                    "send_attachments",
                )

            operations = (
                ("list_chats", get_chats),
                ("list_chats_older", get_older_chats),
                ("list_messages", get_messages),
                ("list_messages_older", get_older_messages),
                ("search_messages", search_messages),
                ("send_message", send_message),
                ("send_attachments", send_attachments),
            )
            return [
                {
                    "operation": operation_name,
                    "workload": workload.name,
                    "dimensions": asdict(workload),
                    "latency": time_operation(operation, warmups, iterations),
                }
                for operation_name, operation in operations
            ]
    finally:
        fastapi_app.dependency_overrides.clear()
        schema_engine.dispose()
        with admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        admin_engine.dispose()


def print_results(results: list[dict[str, Any]]) -> None:
    print(
        f"{'operation':<20} {'workload':<9} {'p50 ms':>10} {'p95 ms':>10} {'mean ms':>10}"
    )
    for result in results:
        latency = result["latency"]
        print(
            f"{result['operation']:<20} {result['workload']:<9} "
            f"{latency['p50_ms']:>10.3f} {latency['p95_ms']:>10.3f} "
            f"{latency['mean_ms']:>10.3f}"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--iterations", type=int, default=25)
    parser.add_argument("--warmups", type=int, default=10)
    parser.add_argument(
        "--output",
        type=Path,
        help="JSON output path (default: benchmark-results/<timestamp>.json)",
    )
    parser.add_argument("--baseline", type=Path, help="Prior JSON result to compare")
    parser.add_argument(
        "--max-regression-percent",
        type=float,
        help="Fail when any matching p95 exceeds this percentage regression",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.iterations < 1 or args.warmups < 0:
        raise SystemExit("iterations must be positive and warmups cannot be negative")
    if args.max_regression_percent is not None and args.baseline is None:
        raise SystemExit("--max-regression-percent requires --baseline")
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        raise SystemExit(
            "TEST_DATABASE_URL is required; use `make benchmark` to start PostgreSQL"
        )

    results = []
    for workload in WORKLOADS:
        print(f"Running {workload.name} workload...", flush=True)
        results.extend(
            run_workload(workload, database_url, args.warmups, args.iterations)
        )

    created_at = datetime.now(timezone.utc)
    document: dict[str, Any] = {
        "schema_version": 1,
        "created_at": created_at.isoformat(),
        "git_revision": git_revision(),
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "processor": platform.processor() or None,
            "measurement": "FastAPI TestClient with PostgreSQL; setup excluded",
            "warmups": args.warmups,
            "iterations": args.iterations,
        },
        "results": results,
    }

    comparisons = []
    if args.baseline:
        baseline_document = json.loads(args.baseline.read_text())
        comparisons = compare_results(results, baseline_document["results"])
        document["baseline"] = str(args.baseline)
        document["comparisons"] = comparisons

    output = args.output
    if output is None:
        output = DEFAULT_RESULTS_DIR / created_at.strftime("%Y%m%dT%H%M%SZ.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=2) + "\n")

    print()
    print_results(results)
    if comparisons:
        print("\np95 comparison to baseline:")
        for comparison in comparisons:
            print(
                f"  {comparison['operation']}/{comparison['workload']}: "
                f"{comparison['delta_percent']:+.2f}%"
            )
    print(f"\nResults written to {output}")

    if args.max_regression_percent is not None:
        regressions = [
            item
            for item in comparisons
            if item["delta_percent"] > args.max_regression_percent
        ]
        if regressions:
            print(
                f"p95 regression threshold exceeded for {len(regressions)} result(s)",
                file=sys.stderr,
            )
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
