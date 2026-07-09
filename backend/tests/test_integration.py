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
from app.socket import sio  # noqa: E402


async def noop_emit(*args, **kwargs):
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
        self.test_database_url = os.getenv("TEST_DATABASE_URL")
        if self.test_database_url is None:
            raise unittest.SkipTest("TEST_DATABASE_URL is not set")

        self.schema = f"test_{uuid4().hex}"
        self.admin_engine = create_engine(self.test_database_url, echo=False)
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))

        self.engine = create_engine(
            self.test_database_url,
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
            json={
                "username": username,
                "password": "password123",
                "first_name": username_prefix.title(),
                "last_name": None,
                "bio": None,
                "avatar_url": "/favicon.svg",
                "status": "online",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return client, response.json()

    def create_group(self, owner_client: TestClient, member_ids: list[int]):
        response = owner_client.post(
            "/chats/group",
            json={
                "title": f"group-{uuid4().hex[:8]}",
                "description": None,
                "avatar_url": "/favicon.svg",
                "member_ids": member_ids,
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

    def test_message_permission_blocks_group_sending(self):
        owner_client, _owner = self.signup("owner")
        member_client, member = self.signup("member")
        group = self.create_group(owner_client, [member["id"]])

        self.patch_member_defaults(
            owner_client,
            group["id"],
            {"send_messages": False},
        )

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
        owner_client, _owner = self.signup("owner")
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

        candidate_permissions = {
            permission: True for permission in ADMIN_PERMISSIONS
        }
        blocked_response = admin_client.post(
            f"/chats/{group['id']}/admins/{candidate['id']}/promote",
            json=candidate_permissions,
        )
        self.assertEqual(blocked_response.status_code, 403)

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

    def test_direct_chat_lookup_returns_existing_chat_and_self_chat(self):
        sender_client, sender = self.signup("sender")
        _recipient_client, recipient = self.signup("recipient")

        direct = sender_client.post(
            "/messages/direct",
            json={"recipient_id": recipient["id"], "content": "hello"},
        )
        self.assertEqual(direct.status_code, 200, direct.text)
        direct_chat_id = direct.json()["chat"]["id"]

        existing_direct = sender_client.get(
            f"/chats/direct/by-user/{recipient['id']}",
        )
        self.assertEqual(existing_direct.status_code, 200, existing_direct.text)
        self.assertEqual(existing_direct.json()["id"], direct_chat_id)

        self_chat = sender_client.get(f"/chats/direct/by-user/{sender['id']}")
        self.assertEqual(self_chat.status_code, 200, self_chat.text)
        self.assertEqual(self_chat.json()["type"], "self")


if __name__ == "__main__":
    unittest.main()
