import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const tempDir = mkdtempSync(join(tmpdir(), "carestudy-chats-test-"));
process.env.SQLITE_PATH = join(tempDir, "test.db");
process.env.DB_DRIVER = "sqlite";

let createSqliteStore: typeof import("../sqlite").createSqliteStore;
let closeSqlite: typeof import("../sqlite").closeSqlite;
let store: ReturnType<typeof createSqliteStore>;

before(async () => {
  const module = await import("../sqlite");
  createSqliteStore = module.createSqliteStore;
  closeSqlite = module.closeSqlite;
  store = createSqliteStore();
});

after(() => {
  closeSqlite();
  rmSync(tempDir, { recursive: true, force: true });
});

async function createStudent(name: string) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return store.addStudent({
    name,
    username: `chat_${suffix}`,
    email: `${suffix}@example.com`,
    passwordHash: createHash("sha256").update("test-password").digest("hex"),
    college: "Test Nursing College",
    program: "RGN",
  });
}

describe("Student chat history", () => {
  it("isolates conversations by student and supports loading, updating, and deletion", async () => {
    const owner = await createStudent("Chat Owner");
    const otherStudent = await createStudent("Other Student");
    const chat = await store.addStudentChat({
      studentId: owner.id,
      title: "Pharmacokinetics",
      messages: [
        { role: "user", content: "Explain ADME." },
        {
          role: "assistant",
          content: "ADME describes drug movement [1].",
          references: [{ label: "Course text", inText: "(Course text)", url: "https://example.org" }],
        },
      ],
    });

    assert.equal(chat.studentId, owner.id);
    assert.equal(chat.messages.length, 2);
    assert.deepEqual((await store.listStudentChats(owner.id)).map((item) => item.id), [chat.id]);
    assert.deepEqual(await store.listStudentChats(otherStudent.id), []);
    assert.equal(await store.getStudentChat(chat.id, otherStudent.id), null);
    assert.equal(await store.removeStudentChat(chat.id, otherStudent.id), false);

    const updated = await store.updateStudentChat(chat.id, owner.id, {
      title: "ADME overview",
      messages: [{ role: "user", content: "Explain absorption." }],
    });
    assert.equal(updated?.title, "ADME overview");
    assert.deepEqual(updated?.messages, [{ role: "user", content: "Explain absorption." }]);

    assert.equal(await store.removeStudentChat(chat.id, owner.id), true);
    assert.equal(await store.getStudentChat(chat.id, owner.id), null);
  });
});
