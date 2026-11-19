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

async function createAdmin(role: "admin" | "staff" = "staff") {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return store.addAdmin({
    username: `export_${suffix}`,
    passwordHash: "test-password-hash",
    role,
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

describe("Daily AI usage quotas", () => {
  it("atomically enforces per-subject daily request limits", async () => {
    const subject = "student:quota-test";
    const today = "2026-11-19";

    assert.deepEqual(
      await store.reserveAiDailyUsage(subject, today, "student_text", 2),
      { status: "reserved", count: 1 },
    );
    assert.deepEqual(
      await store.reserveAiDailyUsage(subject, today, "student_text", 2),
      { status: "reserved", count: 2 },
    );
    assert.deepEqual(
      await store.reserveAiDailyUsage(subject, today, "student_text", 2),
      { status: "limit", count: 2 },
    );
    assert.deepEqual(
      await store.reserveAiDailyUsage(subject, "2026-11-20", "student_text", 2),
      { status: "reserved", count: 1 },
    );
  });

  it("enforces project-scoped AI attempt limits and supports owner resets", async () => {
    const project = "study:quota-test";
    const section = "section:2.1";

    assert.deepEqual(await store.reserveAiProjectUsage(project, [section], 3), { status: "reserved", count: 1 });
    assert.deepEqual(await store.reserveAiProjectUsage(project, [section], 3), { status: "reserved", count: 2 });
    assert.deepEqual(await store.reserveAiProjectUsage(project, [section], 3), { status: "reserved", count: 3 });
    assert.deepEqual(await store.reserveAiProjectUsage(project, [section], 3), { status: "limit", count: 3 });
    assert.deepEqual(await store.reserveAiProjectUsage(project, ["section:2.2"], 3), { status: "reserved", count: 1 });
    assert.deepEqual(
      await store.reserveAiProjectUsage(project, ["section:2.2", section], 3),
      { status: "limit", count: 3 },
    );
    assert.deepEqual(await store.reserveAiProjectUsage(project, ["section:2.2"], 3), { status: "reserved", count: 2 });
    assert.equal(await store.resetAiProjectUsage(project, [section]), 1);
    assert.deepEqual(await store.reserveAiProjectUsage(project, [section], 3), { status: "reserved", count: 1 });
  });

  it("limits staff to one free export and grants one credit per verified payment", async () => {
    const staff = await createAdmin();
    const otherStaff = await createAdmin();
    const reference = `CSE-${staff.id}-test`;

    assert.equal(await store.reserveStaffPreviewExport(staff.id), "free");
    assert.equal(await store.reserveStaffPreviewExport(staff.id), null);
    await store.createStaffPreviewExportPayment(staff.id, reference, 15_000);
    assert.equal(
      await store.verifyStaffPreviewExportPayment(otherStaff.id, reference, 15_000),
      false,
    );
    assert.equal(await store.verifyStaffPreviewExportPayment(staff.id, reference, 14_999), false);
    assert.equal(await store.verifyStaffPreviewExportPayment(staff.id, reference, 15_000), true);
    assert.equal(await store.verifyStaffPreviewExportPayment(staff.id, reference, 15_000), true);
    const paidEntitlement = await store.reserveStaffPreviewExport(staff.id);
    if (paidEntitlement !== "paid") throw new Error("The verified payment did not grant an export credit.");
    await store.refundStaffPreviewExport(staff.id, paidEntitlement);
    assert.equal(await store.reserveStaffPreviewExport(staff.id), "paid");
    assert.equal(await store.reserveStaffPreviewExport(staff.id), null);
  });

  it("restores a staff export entitlement when export generation fails", async () => {
    const staff = await createAdmin();

    const freeEntitlement = await store.reserveStaffPreviewExport(staff.id);
    assert.equal(freeEntitlement, "free");
    await store.refundStaffPreviewExport(staff.id, freeEntitlement);
    assert.equal(await store.reserveStaffPreviewExport(staff.id), "free");
  });

  it("blocks duplicate rewrite documents and enforces the daily unique-document cap", async () => {
    const subject = "student:rewrite-quota-test";
    const today = "2026-11-19";

    for (let index = 1; index <= 5; index += 1) {
      assert.deepEqual(
        await store.reserveAiDocument(subject, today, `hash-${index}`, 5),
        { status: "reserved", count: index },
      );
    }
    assert.deepEqual(
      await store.reserveAiDocument(subject, today, "hash-1", 5),
      { status: "duplicate", count: 0 },
    );
    assert.deepEqual(
      await store.reserveAiDocument(subject, today, "hash-6", 5),
      { status: "limit", count: 5 },
    );
    assert.deepEqual(
      await store.reserveAiDocument(subject, "2026-11-20", "hash-1", 5),
      { status: "reserved", count: 1 },
    );
  });
});
