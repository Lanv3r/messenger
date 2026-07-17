import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-at-least-32-bytes")
os.environ.setdefault(
    "DATABASE_URL",
    os.getenv("TEST_DATABASE_URL")
    or "postgresql+psycopg://unused:unused@localhost/unused",
)

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.exc import OperationalError  # noqa: E402
from sqlmodel import SQLModel, Session, create_engine  # noqa: E402

from app.db import get_session  # noqa: E402
from app.main import fastapi_app  # noqa: E402
from app.permissions import ADMIN_PERMISSIONS, SYSTEM_ROLE_DEFAULTS  # noqa: E402
from app.rate_limit import (  # noqa: E402
    login_rate_limiter,
    message_rate_limiter,
    reset_all_rate_limiters,
    signup_rate_limiter,
    upload_rate_limiter,
)
from app.socket import sio  # noqa: E402


async def noop_emit(*args, **kwargs) -> None:
    return None


class MessengerIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_database_url = os.getenv("TEST_DATABASE_URL")
        if not test_database_url:
            raise unittest.SkipTest("TEST_DATABASE_URL is not set")

        engine = create_engine(test_database_url, echo=False)
        try:
            with engine.connect():
                pass
        except OperationalError as error:
            raise unittest.SkipTest(
                "TEST_DATABASE_URL is not reachable. Create the test database "
                "first, then rerun the tests."
            ) from error
        finally:
            engine.dispose()

    def setUp(self):
        reset_all_rate_limiters()
        test_database_url = os.getenv("TEST_DATABASE_URL")
        if test_database_url is None:
            raise unittest.SkipTest("TEST_DATABASE_URL is not set")
        self.test_database_url = test_database_url

        self.schema = f"test_{uuid4().hex}"
        self.admin_engine = create_engine(test_database_url, echo=False)
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))

        self.engine = create_engine(
            test_database_url,
            echo=False,
            connect_args={"options": f"-csearch_path={self.schema}"},
        )
        SQLModel.metadata.create_all(self.engine)

        def override_get_session():
            with Session(self.engine) as session:
                yield session

        fastapi_app.dependency_overrides[get_session] = override_get_session
        self.emit_patch = patch.object(sio, "emit", noop_emit)
        self.emit_patch.start()
        self.clients: list[TestClient] = []

    def tearDown(self):
        reset_all_rate_limiters()
        for client in self.clients:
            client.close()
        fastapi_app.dependency_overrides.clear()
        self.emit_patch.stop()
        self.engine.dispose()
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE'))
        self.admin_engine.dispose()

    def client(self) -> TestClient:
        client = TestClient(fastapi_app)
        self.clients.append(client)
        return client

    def signup(self, username_prefix: str):
        client = self.client()
        username = f"{username_prefix}_{uuid4().hex[:8]}".lower()
        response = client.post(
            "/signup",
            data={
                "username": username,
                "password": "password123",
                "first_name": username_prefix.title(),
                "last_name": "",
                "bio": "",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return client, response.json()

    def create_group(self, owner_client: TestClient, member_ids: list[int]):
        response = owner_client.post(
            "/chats/group",
            data={
                "title": f"group-{uuid4().hex[:8]}",
                "description": "",
                "member_ids": [str(member_id) for member_id in member_ids],
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def patch_member_defaults(
        self,
        owner_client: TestClient,
        chat_id: int,
        updates: dict,
    ):
        permissions = SYSTEM_ROLE_DEFAULTS["member"].copy()
        permissions.update(updates)
        response = owner_client.patch(
            f"/chats/{chat_id}/member-default-permissions",
            json=permissions,
        )
        self.assertEqual(response.status_code, 200, response.text)
        return permissions

    def get_message(self, response, message_id: int):
        self.assertEqual(response.status_code, 200, response.text)
        for message in response.json():
            if message["id"] == message_id:
                return message
        self.fail(f"Message {message_id} was not returned")

    def admin_permissions(self, enabled: bool = False, **updates):
        permissions = {permission: enabled for permission in ADMIN_PERMISSIONS}
        for permission, value in SYSTEM_ROLE_DEFAULTS["member"].items():
            if permission in permissions and value is True:
                permissions[permission] = True
        permissions.update(updates)
        return permissions

    def test_auth_signup_login_and_protected_chats(self):
        signup_client, user = self.signup("auth")

        self.assertIn("access_token", signup_client.cookies)
        chats_response = signup_client.get("/chats")
        self.assertEqual(chats_response.status_code, 200, chats_response.text)
        self.assertEqual(chats_response.json()[0]["type"], "self")

        anonymous_client = self.client()
        anonymous_response = anonymous_client.get("/chats")
        self.assertEqual(anonymous_response.status_code, 401)

        login_client = self.client()
        bad_login = login_client.post(
            "/login",
            json={"username": user["username"], "password": "wrong-password"},
        )
        self.assertEqual(bad_login.status_code, 401)

        good_login = login_client.post(
            "/login",
            json={"username": user["username"], "password": "password123"},
        )
        self.assertEqual(good_login.status_code, 200, good_login.text)
        self.assertIn("access_token", login_client.cookies)

    def test_chat_access_requires_membership(self):
        owner_client, _owner = self.signup("owner")
        member_client, member = self.signup("member")
        outsider_client, _outsider = self.signup("outsider")
        group = self.create_group(owner_client, [member["id"]])

        member_response = member_client.get(f"/chats/{group['id']}/messages")
        self.assertEqual(member_response.status_code, 200, member_response.text)

        outsider_response = outsider_client.get(f"/chats/{group['id']}/messages")
        self.assertEqual(outsider_response.status_code, 403)

    def test_non_member_cannot_access_chat_or_message_endpoints(self):
        owner_client, _owner = self.signup("owner")
        member_client, member = self.signup("member")
        outsider_client, _outsider = self.signup("outsider")
        _candidate_client, candidate = self.signup("candidate")
        group = self.create_group(owner_client, [member["id"]])

        message_response = owner_client.post(
            f"/chats/{group['id']}/messages",
            json={"content": "private group message"},
        )
        self.assertEqual(message_response.status_code, 200, message_response.text)
        message_id = message_response.json()["id"]

        checks = [
            outsider_client.get(f"/chats/{group['id']}/members"),
            outsider_client.patch(
                f"/chats/{group['id']}/settings",
                json={"is_pinned": True},
            ),
            outsider_client.post(
                f"/chats/{group['id']}/messages",
                json={"content": "intrusion"},
            ),
            outsider_client.get(
                f"/chats/{group['id']}/messages/search",
                params={"query": "private"},
            ),
            outsider_client.post(
                f"/chats/{group['id']}/read",
                json={"last_read_message_id": message_id},
            ),
            outsider_client.post(
                f"/chats/{group['id']}/members",
                json={"member_ids": [candidate["id"]]},
            ),
            outsider_client.post(
                f"/messages/{message_id}/pin",
                json={"scope": "chat"},
            ),
            outsider_client.request(
                "DELETE",
                f"/messages/{message_id}/unpin",
            ),
            outsider_client.patch(
                f"/messages/{message_id}",
                json={"content": "edited by outsider"},
            ),
            outsider_client.request(
                "DELETE",
                f"/messages/{message_id}",
                json={"scope": "chat"},
            ),
            outsider_client.post(
                f"/chats/{group['id']}/messages/voice",
                data={"duration_ms": "1000"},
                files={"file": ("voice.webm", b"audio", "audio/webm")},
            ),
            outsider_client.post(
                f"/chats/{group['id']}/messages/files",
                files=[
                    ("files", ("one.png", b"one", "image/png")),
                    ("files", ("two.png", b"two", "image/png")),
                ],
            ),
            outsider_client.get(
                f"/chats/{group['id']}/member-default-permissions",
            ),
            outsider_client.get(
                f"/chats/{group['id']}/permissions",
            ),
            outsider_client.patch(
                f"/chats/{group['id']}/member-default-permissions",
                json=SYSTEM_ROLE_DEFAULTS["member"],
            ),
            outsider_client.patch(
                f"/chats/{group['id']}/group",
                data={"title": "intrusion", "description": ""},
            ),
            outsider_client.patch(
                f"/chats/{group['id']}/members/{member['id']}/permissions",
                json=SYSTEM_ROLE_DEFAULTS["member"],
            ),
            outsider_client.get(
                f"/chats/{group['id']}/admins/{member['id']}/permissions",
            ),
            outsider_client.patch(
                f"/chats/{group['id']}/admins/{member['id']}/permissions",
                json=self.admin_permissions(True),
            ),
            outsider_client.post(
                f"/chats/{group['id']}/admins/{member['id']}/promote",
                json=self.admin_permissions(True),
            ),
            outsider_client.post(
                f"/chats/{group['id']}/admins/{member['id']}/dismiss",
            ),
            outsider_client.request(
                "DELETE",
                f"/chats/{group['id']}/members/{member['id']}",
            ),
            outsider_client.request(
                "DELETE",
                f"/chats/{group['id']}",
                json={"delete_messages_for_everyone": False},
            ),
            outsider_client.request(
                "DELETE",
                f"/chats/{group['id']}/group",
            ),
        ]

        for response in checks:
            self.assertEqual(response.status_code, 403, response.text)

    def test_group_profile_update_and_owner_global_delete(self):
        owner_client, _owner = self.signup("owner")
        member_client, member = self.signup("member")
        group = self.create_group(owner_client, [member["id"]])

        member_update = member_client.patch(
            f"/chats/{group['id']}/group",
            data={
                "title": "Member-edited group",
                "description": "A shared group bio",
            },
        )
        self.assertEqual(member_update.status_code, 200, member_update.text)
        self.assertEqual(member_update.json()["title"], "Member-edited group")
        self.assertEqual(
            member_update.json()["description"],
            "A shared group bio",
        )

        self.patch_member_defaults(
            owner_client,
            group["id"],
            {"change_group_info": False},
        )
        denied_update = member_client.patch(
            f"/chats/{group['id']}/group",
            data={"title": "Blocked", "description": ""},
        )
        self.assertEqual(denied_update.status_code, 403, denied_update.text)

        denied_delete = member_client.request(
            "DELETE",
            f"/chats/{group['id']}/group",
        )
        self.assertEqual(denied_delete.status_code, 403, denied_delete.text)

        owner_delete = owner_client.request(
            "DELETE",
            f"/chats/{group['id']}/group",
        )
        self.assertEqual(owner_delete.status_code, 200, owner_delete.text)

        member_chats = member_client.get("/chats")
        self.assertEqual(member_chats.status_code, 200, member_chats.text)
        self.assertNotIn(group["id"], [chat["id"] for chat in member_chats.json()])

        deleted_group_members = member_client.get(f"/chats/{group['id']}/members")
        self.assertIn(deleted_group_members.status_code, {403, 404})

    def test_delete_chat_clears_history_and_can_delete_own_messages_globally(self):
        sender_client, sender = self.signup("sender")
        recipient_client, recipient = self.signup("recipient")

        first_response = sender_client.post(
            "/messages/direct",
            json={"recipient_id": recipient["id"], "content": "first"},
        )
        self.assertEqual(first_response.status_code, 200, first_response.text)
        chat_id = first_response.json()["chat"]["id"]
        first_message_id = first_response.json()["message"]["id"]

        reply_response = recipient_client.post(
            f"/chats/{chat_id}/messages",
            json={"content": "reply"},
        )
        self.assertEqual(reply_response.status_code, 200, reply_response.text)

        clear_response = sender_client.request(
            "DELETE",
            f"/chats/{chat_id}",
            json={"delete_messages_for_everyone": False},
        )
        self.assertEqual(clear_response.status_code, 200, clear_response.text)

        cleared_messages = sender_client.get(f"/chats/{chat_id}/messages")
        self.assertEqual(cleared_messages.status_code, 200, cleared_messages.text)
        self.assertEqual(cleared_messages.json(), [])

        hidden_chat_ids = {
            chat["id"] for chat in sender_client.get("/chats").json()
        }
        self.assertNotIn(chat_id, hidden_chat_ids)

        hidden_message_action = sender_client.patch(
            f"/messages/{first_message_id}",
            json={"content": "must stay hidden"},
        )
        self.assertEqual(hidden_message_action.status_code, 404)

        visible_to_recipient = recipient_client.get(f"/chats/{chat_id}/messages")
        self.assertEqual(visible_to_recipient.status_code, 200, visible_to_recipient.text)
        self.assertEqual(
            {message["content"] for message in visible_to_recipient.json()},
            {"first", "reply"},
        )

        global_delete = sender_client.request(
            "DELETE",
            f"/chats/{chat_id}",
            json={"delete_messages_for_everyone": True},
        )
        self.assertEqual(global_delete.status_code, 200, global_delete.text)

        after_global_delete = recipient_client.get(f"/chats/{chat_id}/messages")
        self.assertEqual(
            after_global_delete.status_code,
            200,
            after_global_delete.text,
        )
        self.assertEqual(
            [message["content"] for message in after_global_delete.json()],
            ["reply"],
        )

    def test_clear_history_keeps_direct_chat_visible(self):
        sender_client, _sender = self.signup("clear-sender")
        recipient_client, recipient = self.signup("clear-recipient")

        message_response = sender_client.post(
            "/messages/direct",
            json={"recipient_id": recipient["id"], "content": "clear me"},
        )
        self.assertEqual(message_response.status_code, 200, message_response.text)
        chat_id = message_response.json()["chat"]["id"]

        clear_response = sender_client.request(
            "DELETE",
            f"/chats/{chat_id}",
            json={"clear_history": True},
        )
        self.assertEqual(clear_response.status_code, 200, clear_response.text)
        self.assertTrue(clear_response.json()["cleared_history"])

        chats_response = sender_client.get("/chats")
        self.assertEqual(chats_response.status_code, 200, chats_response.text)
        cleared_chat = next(
            chat for chat in chats_response.json() if chat["id"] == chat_id
        )
        self.assertIsNone(cleared_chat["last_message_id"])

        messages_response = sender_client.get(f"/chats/{chat_id}/messages")
        self.assertEqual(messages_response.status_code, 200, messages_response.text)
        self.assertEqual(messages_response.json(), [])

    def test_clearing_populated_group_history_keeps_group_in_chat_list(self):
        owner_client, _owner = self.signup("owner")
        member_client, member = self.signup("member")
        group = self.create_group(owner_client, [member["id"]])

        message_response = owner_client.post(
            f"/chats/{group['id']}/messages",
            json={"content": "group history"},
        )
        self.assertEqual(message_response.status_code, 200, message_response.text)

        clear_response = owner_client.request(
            "DELETE",
            f"/chats/{group['id']}",
            json={"delete_messages_for_everyone": False},
        )
        self.assertEqual(clear_response.status_code, 200, clear_response.text)
        self.assertTrue(clear_response.json()["cleared_history"])

        owner_chats = owner_client.get("/chats")
        self.assertEqual(owner_chats.status_code, 200, owner_chats.text)
        owner_group = next(
            chat for chat in owner_chats.json() if chat["id"] == group["id"]
        )
        self.assertIsNone(owner_group["last_message_id"])
        self.assertEqual(owner_group["unread_count"], 0)

        owner_messages = owner_client.get(f"/chats/{group['id']}/messages")
        self.assertEqual(owner_messages.status_code, 200, owner_messages.text)
        self.assertEqual(owner_messages.json(), [])

        member_messages = member_client.get(f"/chats/{group['id']}/messages")
        self.assertEqual(member_messages.status_code, 200, member_messages.text)
        self.assertEqual(
            [message["content"] for message in member_messages.json()],
            ["group history"],
        )

    def test_read_marker_must_belong_to_chat(self):
        owner_client, _owner = self.signup("owner")
        _member_client, member = self.signup("member")
        group = self.create_group(owner_client, [member["id"]])
        chats = owner_client.get("/chats")
        self.assertEqual(chats.status_code, 200, chats.text)
        self_chat_id = next(chat["id"] for chat in chats.json() if chat["type"] == "self")

        self_message = owner_client.post(
            f"/chats/{self_chat_id}/messages",
            json={"content": "self only"},
        )
        self.assertEqual(self_message.status_code, 200, self_message.text)

        response = owner_client.post(
            f"/chats/{group['id']}/read",
            json={"last_read_message_id": self_message.json()["id"]},
        )
        self.assertEqual(response.status_code, 400, response.text)

    def test_group_message_read_indicator_marks_any_reader(self):
        owner_client, _owner = self.signup("owner")
        member_client, member = self.signup("member")
        group = self.create_group(owner_client, [member["id"]])

        message_response = owner_client.post(
            f"/chats/{group['id']}/messages",
            json={"content": "read receipt"},
        )
        self.assertEqual(message_response.status_code, 200, message_response.text)
        message_id = message_response.json()["id"]

        owner_read_response = owner_client.post(
            f"/chats/{group['id']}/read",
            json={"last_read_message_id": message_id},
        )
        self.assertEqual(owner_read_response.status_code, 200, owner_read_response.text)
        owner_message = self.get_message(
            owner_client.get(f"/chats/{group['id']}/messages"),
            message_id,
        )
        self.assertFalse(owner_message["read_by_anyone"])

        member_read_response = member_client.post(
            f"/chats/{group['id']}/read",
            json={"last_read_message_id": message_id},
        )
        self.assertEqual(member_read_response.status_code, 200, member_read_response.text)
        owner_message = self.get_message(
            owner_client.get(f"/chats/{group['id']}/messages"),
            message_id,
        )
        self.assertTrue(owner_message["read_by_anyone"])

    def test_message_permission_blocks_group_sending(self):
        owner_client, _owner = self.signup("owner")
        member_client, member = self.signup("member")
        group = self.create_group(owner_client, [member["id"]])

        self.patch_member_defaults(
            owner_client,
            group["id"],
            {"send_messages": False},
        )

        member_permissions = member_client.get(
            f"/chats/{group['id']}/permissions",
        )
        self.assertEqual(member_permissions.status_code, 200, member_permissions.text)
        self.assertFalse(member_permissions.json()["send_messages"])

        owner_permissions = owner_client.get(
            f"/chats/{group['id']}/permissions",
        )
        self.assertEqual(owner_permissions.status_code, 200, owner_permissions.text)
        self.assertTrue(owner_permissions.json()["send_messages"])

        blocked_response = member_client.post(
            f"/chats/{group['id']}/messages",
            json={"content": "blocked"},
        )
        self.assertEqual(blocked_response.status_code, 403)

        owner_response = owner_client.post(
            f"/chats/{group['id']}/messages",
            json={"content": "owner can still send"},
        )
        self.assertEqual(owner_response.status_code, 200, owner_response.text)

    def test_member_can_leave_group_but_owner_cannot(self):
        owner_client, _owner = self.signup("owner")
        member_client, member = self.signup("member")
        group = self.create_group(owner_client, [member["id"]])

        owner_leave = owner_client.post(f"/chats/{group['id']}/leave")
        self.assertEqual(owner_leave.status_code, 403, owner_leave.text)

        member_leave = member_client.post(f"/chats/{group['id']}/leave")
        self.assertEqual(member_leave.status_code, 200, member_leave.text)

        member_chats = member_client.get("/chats")
        self.assertEqual(member_chats.status_code, 200, member_chats.text)
        self.assertNotIn(group["id"], [chat["id"] for chat in member_chats.json()])

        remaining_members = owner_client.get(f"/chats/{group['id']}/members")
        self.assertEqual(remaining_members.status_code, 200, remaining_members.text)
        self.assertNotIn(
            member["id"],
            [chat_member["user_id"] for chat_member in remaining_members.json()],
        )

    def test_multiple_file_uploads_create_one_message(self):
        client, _user = self.signup("album")
        chats = client.get("/chats")
        self.assertEqual(chats.status_code, 200, chats.text)
        self_chat_id = next(chat["id"] for chat in chats.json() if chat["type"] == "self")

        response = client.post(
            f"/chats/{self_chat_id}/messages/files",
            data={"content": "two photos"},
            files=[
                ("files", ("one.png", b"one", "image/png")),
                ("files", ("two.jpg", b"two", "image/jpeg")),
            ],
        )
        self.assertEqual(response.status_code, 200, response.text)

        message = response.json()
        self.assertEqual(message["message_type"], "album")
        self.assertEqual(message["content"], "two photos")
        self.assertEqual(len(message["metadata"]["attachments"]), 2)

        messages = client.get(f"/chats/{self_chat_id}/messages")
        self.assertEqual(messages.status_code, 200, messages.text)
        uploaded_messages = [
            entry for entry in messages.json() if entry["content"] == "two photos"
        ]
        self.assertEqual(len(uploaded_messages), 1)
        self.assertEqual(uploaded_messages[0]["id"], message["id"])

    def test_group_permissions_for_adding_members_and_locked_defaults(self):
        owner_client, _owner = self.signup("owner")
        member_client, member = self.signup("member")
        _candidate_client, candidate = self.signup("candidate")
        group = self.create_group(owner_client, [member["id"]])

        default_permissions = self.patch_member_defaults(
            owner_client,
            group["id"],
            {"add_members": False},
        )

        blocked_add = member_client.post(
            f"/chats/{group['id']}/members",
            json={"member_ids": [candidate["id"]]},
        )
        self.assertEqual(blocked_add.status_code, 403)

        invalid_override = default_permissions.copy()
        invalid_override["add_members"] = True
        locked_response = owner_client.patch(
            f"/chats/{group['id']}/members/{member['id']}/permissions",
            json=invalid_override,
        )
        self.assertEqual(locked_response.status_code, 400)

        owner_add = owner_client.post(
            f"/chats/{group['id']}/members",
            json={"member_ids": [candidate["id"]]},
        )
        self.assertEqual(owner_add.status_code, 200, owner_add.text)
        self.assertIn(candidate["id"], owner_add.json()["member_ids"])

    def test_admin_cannot_grant_permissions_they_do_not_have(self):
        owner_client, owner = self.signup("owner")
        admin_client, admin = self.signup("admin")
        _candidate_client, candidate = self.signup("candidate")
        group = self.create_group(owner_client, [admin["id"], candidate["id"]])

        admin_permissions = {permission: True for permission in ADMIN_PERMISSIONS}
        admin_permissions["manage_admins"] = False
        promote_response = owner_client.post(
            f"/chats/{group['id']}/admins/{admin['id']}/promote",
            json=admin_permissions,
        )
        self.assertEqual(promote_response.status_code, 200, promote_response.text)
        promoted_member = promote_response.json()
        self.assertEqual(promoted_member["role"], "admin")
        self.assertEqual(promoted_member["promoted_by"], owner["id"])
        self.assertIsNotNone(promoted_member["promoted_at"])
        self.assertEqual(
            promoted_member["promoted_by_user"]["username"],
            owner["username"],
        )
        self.assertTrue(promoted_member["can_edit_admin_rights"])
        self.assertTrue(promoted_member["can_edit_member_rights"])
        self.assertTrue(promoted_member["can_remove_from_group"])

        candidate_permissions = {
            permission: True for permission in ADMIN_PERMISSIONS
        }
        blocked_response = admin_client.post(
            f"/chats/{group['id']}/admins/{candidate['id']}/promote",
            json=candidate_permissions,
        )
        self.assertEqual(blocked_response.status_code, 403)

        dismiss_response = owner_client.post(
            f"/chats/{group['id']}/admins/{admin['id']}/dismiss",
        )
        self.assertEqual(dismiss_response.status_code, 200, dismiss_response.text)
        dismissed_member = dismiss_response.json()
        self.assertEqual(dismissed_member["role"], "member")
        self.assertTrue(dismissed_member["can_promote_to_admin"])
        self.assertTrue(dismissed_member["can_edit_member_rights"])
        self.assertTrue(dismissed_member["can_remove_from_group"])

    def test_member_tags_require_permission_and_are_returned(self):
        owner_client, _owner = self.signup("owner")
        member_client, member = self.signup("member")
        group = self.create_group(owner_client, [member["id"]])

        blocked = member_client.post(
            f"/chats/{group['id']}/members/{member['id']}/tags",
            json={"tag": "Helper"},
        )
        self.assertEqual(blocked.status_code, 403, blocked.text)

        too_long = owner_client.post(
            f"/chats/{group['id']}/members/{member['id']}/tags",
            json={"tag": "a" * 17},
        )
        self.assertEqual(too_long.status_code, 422, too_long.text)

        member_list = member_client.get(f"/chats/{group['id']}/members")
        self.assertEqual(member_list.status_code, 200, member_list.text)
        current_member = next(
            entry
            for entry in member_list.json()
            if entry["user_id"] == member["id"]
        )
        self.assertFalse(current_member["can_edit_member_tags"])
        self.assertFalse(current_member["can_promote_to_admin"])
        self.assertFalse(current_member["can_edit_member_rights"])
        self.assertFalse(current_member["can_remove_from_group"])

        added = owner_client.post(
            f"/chats/{group['id']}/members/{member['id']}/tags",
            json={"tag": "Helper"},
        )
        self.assertEqual(added.status_code, 200, added.text)
        self.assertEqual(added.json()["member_tags"], ["Helper"])
        self.assertTrue(added.json()["can_edit_member_tags"])
        self.assertTrue(added.json()["can_promote_to_admin"])
        self.assertTrue(added.json()["can_edit_member_rights"])
        self.assertTrue(added.json()["can_remove_from_group"])

        members = owner_client.get(f"/chats/{group['id']}/members")
        self.assertEqual(members.status_code, 200, members.text)
        tagged_member = next(
            entry for entry in members.json() if entry["user_id"] == member["id"]
        )
        self.assertEqual(tagged_member["member_tags"], ["Helper"])

    def test_admin_with_manage_admins_cannot_grant_rights_they_do_not_have(self):
        owner_client, _owner = self.signup("owner")
        admin_client, admin = self.signup("admin")
        _candidate_client, candidate = self.signup("candidate")
        group = self.create_group(owner_client, [admin["id"], candidate["id"]])

        limited_permissions = self.admin_permissions(
            False,
            manage_admins=True,
            delete_messages=False,
        )
        promote_admin = owner_client.post(
            f"/chats/{group['id']}/admins/{admin['id']}/promote",
            json=limited_permissions,
        )
        self.assertEqual(promote_admin.status_code, 200, promote_admin.text)

        candidate_permissions = limited_permissions.copy()
        candidate_permissions["delete_messages"] = True
        blocked_response = admin_client.post(
            f"/chats/{group['id']}/admins/{candidate['id']}/promote",
            json=candidate_permissions,
        )
        self.assertEqual(blocked_response.status_code, 403, blocked_response.text)

    def test_admin_hierarchy_requires_strictly_higher_permissions(self):
        owner_client, _owner = self.signup("owner")
        superior_client, superior = self.signup("superior")
        inferior_client, inferior = self.signup("inferior")
        equal_client, equal = self.signup("equal")
        group = self.create_group(
            owner_client,
            [superior["id"], inferior["id"], equal["id"]],
        )

        full_permissions = self.admin_permissions(True)
        inferior_permissions = self.admin_permissions(False, manage_admins=True)

        for user, permissions in [
            (superior, full_permissions),
            (inferior, inferior_permissions),
            (equal, full_permissions),
        ]:
            response = owner_client.post(
                f"/chats/{group['id']}/admins/{user['id']}/promote",
                json=permissions,
            )
            self.assertEqual(response.status_code, 200, response.text)

        equal_dismiss = superior_client.post(
            f"/chats/{group['id']}/admins/{equal['id']}/dismiss",
        )
        self.assertEqual(equal_dismiss.status_code, 403, equal_dismiss.text)

        inferior_dismiss_equal = inferior_client.post(
            f"/chats/{group['id']}/admins/{equal['id']}/dismiss",
        )
        self.assertEqual(
            inferior_dismiss_equal.status_code,
            403,
            inferior_dismiss_equal.text,
        )

        superior_dismiss_inferior = superior_client.post(
            f"/chats/{group['id']}/admins/{inferior['id']}/dismiss",
        )
        self.assertEqual(
            superior_dismiss_inferior.status_code,
            200,
            superior_dismiss_inferior.text,
        )

    def test_login_signup_message_and_upload_rate_limits(self):
        old_signup_limit = signup_rate_limiter.limit
        old_login_limit = login_rate_limiter.limit
        old_message_limit = message_rate_limiter.limit
        old_upload_limit = upload_rate_limiter.limit

        try:
            signup_rate_limiter.limit = 1
            signup_rate_limiter.reset()
            first_signup_client = self.client()
            first_signup = first_signup_client.post(
                "/signup",
                data={
                    "username": f"limited_{uuid4().hex[:8]}",
                    "password": "password123",
                    "first_name": "Limited",
                    "last_name": "",
                    "bio": "",
                },
            )
            self.assertEqual(first_signup.status_code, 200, first_signup.text)
            second_signup = self.client().post(
                "/signup",
                data={
                    "username": f"limited_{uuid4().hex[:8]}",
                    "password": "password123",
                    "first_name": "Limited",
                    "last_name": "",
                    "bio": "",
                },
            )
            self.assertEqual(second_signup.status_code, 429, second_signup.text)

            signup_rate_limiter.limit = old_signup_limit
            signup_rate_limiter.reset()

            login_rate_limiter.limit = 2
            login_rate_limiter.reset()
            for _index in range(2):
                response = self.client().post(
                    "/login",
                    json={"username": "missing", "password": "wrong"},
                )
                self.assertEqual(response.status_code, 401, response.text)
            blocked_login = self.client().post(
                "/login",
                json={"username": "missing", "password": "wrong"},
            )
            self.assertEqual(blocked_login.status_code, 429, blocked_login.text)

            login_rate_limiter.limit = old_login_limit
            login_rate_limiter.reset()

            sender_client, _sender = self.signup("sender")
            _recipient_client, recipient = self.signup("recipient")
            message_rate_limiter.limit = 1
            message_rate_limiter.reset()
            first_message = sender_client.post(
                "/messages/direct",
                json={"recipient_id": recipient["id"], "content": "first"},
            )
            self.assertEqual(first_message.status_code, 200, first_message.text)
            second_message = sender_client.post(
                f"/chats/{first_message.json()['chat']['id']}/messages",
                json={"content": "second"},
            )
            self.assertEqual(second_message.status_code, 429, second_message.text)

            message_rate_limiter.limit = old_message_limit
            message_rate_limiter.reset()

            chats = sender_client.get("/chats")
            self.assertEqual(chats.status_code, 200, chats.text)
            self_chat_id = next(
                chat["id"] for chat in chats.json() if chat["type"] == "self"
            )
            upload_rate_limiter.limit = 1
            upload_rate_limiter.reset()
            first_upload = sender_client.post(
                f"/chats/{self_chat_id}/messages/voice",
                data={"duration_ms": "1000"},
                files={"file": ("voice.txt", b"not-audio", "text/plain")},
            )
            self.assertEqual(first_upload.status_code, 400, first_upload.text)
            blocked_upload = sender_client.post(
                f"/chats/{self_chat_id}/messages/voice",
                data={"duration_ms": "1000"},
                files={"file": ("voice.txt", b"not-audio", "text/plain")},
            )
            self.assertEqual(blocked_upload.status_code, 429, blocked_upload.text)
        finally:
            signup_rate_limiter.limit = old_signup_limit
            login_rate_limiter.limit = old_login_limit
            message_rate_limiter.limit = old_message_limit
            upload_rate_limiter.limit = old_upload_limit
            reset_all_rate_limiters()

    def test_edit_delete_and_pin_message_rules(self):
        sender_client, sender = self.signup("sender")
        recipient_client, recipient = self.signup("recipient")

        first_response = sender_client.post(
            "/messages/direct",
            json={"recipient_id": recipient["id"], "content": "first"},
        )
        self.assertEqual(first_response.status_code, 200, first_response.text)
        chat_id = first_response.json()["chat"]["id"]
        first_message_id = first_response.json()["message"]["id"]

        forbidden_edit = recipient_client.patch(
            f"/messages/{first_message_id}",
            json={"content": "edited by recipient"},
        )
        self.assertEqual(forbidden_edit.status_code, 403)

        edited = sender_client.patch(
            f"/messages/{first_message_id}",
            json={"content": "edited by sender"},
        )
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["content"], "edited by sender")

        forbidden_global_delete = recipient_client.request(
            "DELETE",
            f"/messages/{first_message_id}",
            json={"scope": "chat"},
        )
        self.assertEqual(forbidden_global_delete.status_code, 403)

        personal_delete = recipient_client.request(
            "DELETE",
            f"/messages/{first_message_id}",
            json={"scope": "me"},
        )
        self.assertEqual(personal_delete.status_code, 200, personal_delete.text)
        recipient_messages = recipient_client.get(f"/chats/{chat_id}/messages")
        self.assertEqual(recipient_messages.status_code, 200, recipient_messages.text)
        self.assertEqual(recipient_messages.json(), [])

        recipient_chats = recipient_client.get("/chats")
        self.assertEqual(recipient_chats.status_code, 200, recipient_chats.text)
        self.assertNotIn(
            chat_id,
            [chat["id"] for chat in recipient_chats.json()],
        )

        read_deleted_message = recipient_client.post(
            f"/chats/{chat_id}/read",
            json={"last_read_message_id": first_message_id},
        )
        self.assertEqual(read_deleted_message.status_code, 400)

        second_response = sender_client.post(
            f"/chats/{chat_id}/messages",
            json={"content": "second"},
        )
        self.assertEqual(second_response.status_code, 200, second_response.text)
        second_message_id = second_response.json()["id"]

        personal_pin = recipient_client.post(
            f"/messages/{second_message_id}/pin",
            json={"scope": "me"},
        )
        self.assertEqual(personal_pin.status_code, 200, personal_pin.text)
        recipient_messages = recipient_client.get(f"/chats/{chat_id}/messages")
        recipient_second_message = self.get_message(
            recipient_messages,
            second_message_id,
        )
        self.assertTrue(recipient_second_message["is_pinned_for_me"])

        sender_messages = sender_client.get(f"/chats/{chat_id}/messages")
        sender_second_message = self.get_message(sender_messages, second_message_id)
        self.assertFalse(sender_second_message["is_pinned_for_me"])

        shared_pin = sender_client.post(
            f"/messages/{second_message_id}/pin",
            json={"scope": "chat"},
        )
        self.assertEqual(shared_pin.status_code, 200, shared_pin.text)
        sender_messages = sender_client.get(f"/chats/{chat_id}/messages")
        sender_second_message = self.get_message(sender_messages, second_message_id)
        self.assertIsNotNone(sender_second_message["pinned_at"])

    def test_group_delete_and_pin_permissions(self):
        owner_client, _owner = self.signup("owner")
        member_client, member = self.signup("member")
        group = self.create_group(owner_client, [member["id"]])
        self.patch_member_defaults(
            owner_client,
            group["id"],
            {"pin_messages": False},
        )

        owner_message = owner_client.post(
            f"/chats/{group['id']}/messages",
            json={"content": "owner message"},
        )
        self.assertEqual(owner_message.status_code, 200, owner_message.text)
        owner_message_id = owner_message.json()["id"]

        member_pin = member_client.post(
            f"/messages/{owner_message_id}/pin",
            json={"scope": "chat"},
        )
        self.assertEqual(member_pin.status_code, 403)

        owner_pin = owner_client.post(
            f"/messages/{owner_message_id}/pin",
            json={"scope": "chat"},
        )
        self.assertEqual(owner_pin.status_code, 200, owner_pin.text)

        member_delete_other = member_client.request(
            "DELETE",
            f"/messages/{owner_message_id}",
            json={"scope": "chat"},
        )
        self.assertEqual(member_delete_other.status_code, 403)

        member_message = member_client.post(
            f"/chats/{group['id']}/messages",
            json={"content": "member message"},
        )
        self.assertEqual(member_message.status_code, 200, member_message.text)
        member_message_id = member_message.json()["id"]

        member_delete_own = member_client.request(
            "DELETE",
            f"/messages/{member_message_id}",
            json={"scope": "chat"},
        )
        self.assertEqual(member_delete_own.status_code, 200, member_delete_own.text)

    def test_voice_upload_validation(self):
        client, _user = self.signup("voice")
        chats = client.get("/chats")
        self.assertEqual(chats.status_code, 200, chats.text)
        self_chat_id = chats.json()[0]["id"]

        bad_type = client.post(
            f"/chats/{self_chat_id}/messages/voice",
            data={"duration_ms": "1000"},
            files={"file": ("voice.txt", b"not-audio", "text/plain")},
        )
        self.assertEqual(bad_type.status_code, 400)

        bad_duration = client.post(
            f"/chats/{self_chat_id}/messages/voice",
            data={"duration_ms": "0"},
            files={"file": ("voice.webm", b"audio", "audio/webm")},
        )
        self.assertEqual(bad_duration.status_code, 400)

        empty_file = client.post(
            f"/chats/{self_chat_id}/messages/voice",
            data={"duration_ms": "1000"},
            files={"file": ("voice.webm", b"", "audio/webm")},
        )
        self.assertEqual(empty_file.status_code, 400)

    def test_blocked_user_cannot_send_direct_messages(self):
        sender_client, sender = self.signup("sender")
        blocker_client, blocker = self.signup("blocker")

        direct = sender_client.post(
            "/messages/direct",
            json={"recipient_id": blocker["id"], "content": "before block"},
        )
        self.assertEqual(direct.status_code, 200, direct.text)
        chat_id = direct.json()["chat"]["id"]
        message_id = direct.json()["message"]["id"]

        block = blocker_client.put(f"/users/me/blocks/{sender['id']}")
        self.assertEqual(block.status_code, 200, block.text)
        self.assertEqual(block.json()["id"], sender["id"])

        blocks = blocker_client.get("/users/me/blocks")
        self.assertEqual(blocks.status_code, 200, blocks.text)
        self.assertEqual([entry["id"] for entry in blocks.json()], [sender["id"]])

        sender_chats = sender_client.get("/chats")
        self.assertEqual(sender_chats.status_code, 200, sender_chats.text)
        sender_chat = next(
            entry for entry in sender_chats.json() if entry["id"] == chat_id
        )
        self.assertTrue(sender_chat["is_blocked_by_other"])

        blocked_requests = [
            sender_client.post(
                "/messages/direct",
                json={"recipient_id": blocker["id"], "content": "new direct"},
            ),
            sender_client.post(
                f"/chats/{chat_id}/messages",
                json={"content": "text after block"},
            ),
            sender_client.post(
                f"/chats/{chat_id}/messages/voice",
                data={"duration_ms": "1000"},
                files={"file": ("voice.webm", b"audio", "audio/webm")},
            ),
            sender_client.post(
                f"/chats/{chat_id}/messages/files",
                files={"files": ("image.png", b"image", "image/png")},
            ),
            sender_client.patch(
                f"/messages/{message_id}",
                json={"content": "edited after block"},
            ),
        ]
        for response in blocked_requests:
            self.assertEqual(response.status_code, 403, response.text)

        unblock = blocker_client.delete(f"/users/me/blocks/{sender['id']}")
        self.assertEqual(unblock.status_code, 200, unblock.text)

        sender_chats = sender_client.get("/chats")
        self.assertEqual(sender_chats.status_code, 200, sender_chats.text)
        sender_chat = next(
            entry for entry in sender_chats.json() if entry["id"] == chat_id
        )
        self.assertFalse(sender_chat["is_blocked_by_other"])

        allowed_message = sender_client.post(
            f"/chats/{chat_id}/messages",
            json={"content": "after unblock"},
        )
        self.assertEqual(allowed_message.status_code, 200, allowed_message.text)

    def test_direct_chat_lookup_returns_existing_chat_and_self_chat(self):
        sender_client, sender = self.signup("sender")
        _recipient_client, recipient = self.signup("recipient")

        direct = sender_client.post(
            "/messages/direct",
            json={"recipient_id": recipient["id"], "content": "hello"},
        )
        self.assertEqual(direct.status_code, 200, direct.text)
        direct_chat_id = direct.json()["chat"]["id"]
        self.assertEqual(
            direct.json()["chat"]["other_user_status"],
            recipient["status"],
        )

        chats = sender_client.get("/chats")
        self.assertEqual(chats.status_code, 200, chats.text)
        listed_direct = next(
            entry for entry in chats.json() if entry["id"] == direct_chat_id
        )
        self.assertEqual(listed_direct["other_user_status"], recipient["status"])

        existing_direct = sender_client.get(
            f"/chats/direct/by-user/{recipient['id']}",
        )
        self.assertEqual(existing_direct.status_code, 200, existing_direct.text)
        self.assertEqual(existing_direct.json()["id"], direct_chat_id)
        self.assertEqual(
            existing_direct.json()["other_user_status"],
            recipient["status"],
        )

        self_chat = sender_client.get(f"/chats/direct/by-user/{sender['id']}")
        self.assertEqual(self_chat.status_code, 200, self_chat.text)
        self.assertEqual(self_chat.json()["type"], "self")


if __name__ == "__main__":
    unittest.main()
