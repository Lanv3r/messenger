import { expect, test, type APIRequestContext } from "@playwright/test";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";

async function createUser(
  request: APIRequestContext,
  username: string,
  firstName: string,
) {
  const response = await request.post(`${API_URL}/signup`, {
    form: {
      username,
      password: "password123",
      first_name: firstName,
      last_name: "",
      bio: "",
    },
  });

  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ id: number; username: string }>;
}

test("login, chat list, send message, and create group", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString(36);
  const ownerUsername = `smoke_owner_${suffix}`;
  const memberUsername = `smoke_member_${suffix}`;

  await createUser(request, ownerUsername, "Smoke Owner");
  const member = await createUser(request, memberUsername, "Smoke Member");

  await page.goto("/");

  await page.locator("#username").fill(ownerUsername);
  await page.locator("#login-password").fill("password123");
  await page.getByRole("button", { name: "Login" }).click();

  const chatsPanel = page.getByLabel("Chats");
  const savedMessagesButton = chatsPanel.getByRole("button", {
    name: "Saved Messages",
    exact: true,
  });
  await expect(savedMessagesButton).toBeVisible();
  await savedMessagesButton.click();
  const messageList = page.locator("#messages");

  const selfMessage = `self smoke ${suffix}`;
  await page.locator("#message").fill(selfMessage);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(messageList.getByText(selfMessage, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "New group" }).click();
  await page.getByLabel("Group name").fill(`Smoke group ${suffix}`);
  await page.getByLabel("Add members").fill(member.username);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(`@${member.username}`)).toBeVisible();
  await page.getByRole("button", { name: "Create group", exact: true }).click();

  const groupChatButton = chatsPanel.getByRole("button", {
    name: `Smoke group ${suffix}`,
    exact: true,
  });
  await expect(groupChatButton).toBeVisible();
  await groupChatButton.click();

  const groupMessage = `group smoke ${suffix}`;
  await page.locator("#message").fill(groupMessage);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(messageList.getByText(groupMessage, { exact: true })).toBeVisible();
});
