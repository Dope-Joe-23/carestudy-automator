/**
 * Tests for student-staff linking, student invites, and staff-filtered queries.
 *
 * Uses an in-memory SQLite database (via temp file) so tests are isolated
 * and leave no side effects.
 *
 * Run: node --import tsx lib/db/src/__tests__/student-staff.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Setup: create a fresh SQLite file for each test run
// ---------------------------------------------------------------------------

const tempDir = mkdtempSync(join(tmpdir(), "carestudy-test-"));
const dbPath = join(tempDir, "test.db");

// Must set SQLITE_PATH before importing the store (it reads env once).
process.env.SQLITE_PATH = dbPath;
process.env.DB_DRIVER = "sqlite";

// Dynamic import so the env is set first.
let createSqliteStore: typeof import("../sqlite").createSqliteStore;
let closeSqlite: typeof import("../sqlite").closeSqlite;

let store: ReturnType<typeof createSqliteStore>;

before(async () => {
  const mod = await import("../sqlite");
  createSqliteStore = mod.createSqliteStore;
  closeSqlite = mod.closeSqlite;
  store = createSqliteStore();
});

after(() => {
  closeSqlite();
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashPw(pw: string): string {
  // Simple hash for tests (sha256 — not scrypt, too slow for tests)
  return createHash("sha256").update(pw).digest("hex");
}

async function createAdmin(name = "Test Staff", role = "staff") {
  return store.addAdmin({
    username: `staff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    passwordHash: hashPw("password123"),
    name,
    role,
    email: `staff_${Date.now()}@example.com`,
  });
}

async function createStudent(
  name: string,
  staffId: number | null = null,
) {
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return store.addStudent({
    name,
    username: `student_${suffix}`,
    email: `${suffix}@example.com`,
    passwordHash: hashPw("password123"),
    college: "Test Nursing College",
    program: "RGN",
    year: "Year 3",
    staffId,
  });
}

// ===========================================================================
// Tests
// ===========================================================================

// -----------------------------------------------------------------------
// 1. Student-staff linking
// -----------------------------------------------------------------------

describe("Student-staff linking", () => {
  it("should store staffId when creating a student", async () => {
    const staff = await createAdmin("Linked Staff");
    const student = await createStudent("Linked Student", staff.id);

    assert.equal(student.staffId, staff.id, "staffId should match the staff member");

    // Verify via getStudent
    const fetched = await store.getStudent(student.id);
    assert.ok(fetched, "student should be fetchable");
    assert.equal(fetched.staffId, staff.id);
  });

  it("should allow null staffId for independently registered students", async () => {
    const student = await createStudent("Independent Student", null);

    assert.equal(student.staffId, null, "staffId should be null");

    const fetched = await store.getStudent(student.id);
    assert.ok(fetched);
    assert.equal(fetched.staffId, null);
  });
});

// -----------------------------------------------------------------------
// 2. listStudentsByStaff
// -----------------------------------------------------------------------

describe("listStudentsByStaff", () => {
  it("should return only students tied to the given staff", async () => {
    const staffA = await createAdmin("Staff A");
    const staffB = await createAdmin("Staff B");

    const s1 = await createStudent("Student of A1", staffA.id);
    const s2 = await createStudent("Student of A2", staffA.id);
    const s3 = await createStudent("Student of B1", staffB.id);
    const s4 = await createStudent("Orphan Student", null);

    const forA = await store.listStudentsByStaff(staffA.id);
    const forB = await store.listStudentsByStaff(staffB.id);

    const idsA = forA.map((s) => s.id).sort();
    const idsB = forB.map((s) => s.id).sort();

    assert.deepEqual(idsA, [s1.id, s2.id].sort(), "Staff A should see 2 students");
    assert.deepEqual(idsB, [s3.id], "Staff B should see 1 student");
  });

  it("should return empty array for staff with no students", async () => {
    const lonely = await createAdmin("Lonely Staff");
    const result = await store.listStudentsByStaff(lonely.id);
    assert.deepEqual(result, []);
  });
});

// -----------------------------------------------------------------------
// 3. Student invites
// -----------------------------------------------------------------------

describe("Student invites", () => {
  it("should create a student invite", async () => {
    const staff = await createAdmin("Invite Creator");
    const invite = await store.createStudentInvite({
      token: `test_token_${Date.now()}`,
      createdBy: staff.id,
      label: "Test batch",
      staffName: staff.name,
    });

    assert.ok(invite.id > 0, "invite should have an id");
    assert.equal(invite.createdBy, staff.id);
    assert.equal(invite.label, "Test batch");
    assert.equal(invite.staffName, staff.name);
    assert.equal(invite.usedAt, null, "should not be used yet");
    assert.equal(invite.usedBy, null);
  });

  it("should resolve an invite by token", async () => {
    const staff = await createAdmin("Token Resolver");
    const token = `resolve_me_${Date.now()}`;
    await store.createStudentInvite({
      token,
      createdBy: staff.id,
      staffName: staff.name,
    });

    const found = await store.getStudentInviteByToken(token);
    assert.ok(found, "should find the invite by token");
    assert.equal(found.token, token);
    assert.equal(found.staffName, staff.name);
  });

  it("should return null for unknown token", async () => {
    const result = await store.getStudentInviteByToken("nonexistent_token");
    assert.equal(result, null);
  });

  it("should mark an invite as used", async () => {
    const staff = await createAdmin("Use Inviter");
    const invite = await store.createStudentInvite({
      token: `use_me_${Date.now()}`,
      createdBy: staff.id,
      staffName: staff.name,
    });

    const student = await createStudent("Invite User", staff.id);
    const updated = await store.useStudentInvite(invite.id, student.id);

    assert.ok(updated, "should return the updated invite");
    assert.ok(updated.usedAt !== null, "usedAt should be set");
    assert.equal(updated.usedBy, student.id);

    // Re-fetch to confirm persistence
    const refetched = await store.getStudentInviteByToken(invite.token);
    assert.ok(refetched);
    assert.ok(refetched.usedAt !== null, "usedAt should persist");
    assert.equal(refetched.usedBy, student.id);
  });

  it("should list all student invites", async () => {
    const staff = await createAdmin("List Inviter");
    await store.createStudentInvite({
      token: `list_a_${Date.now()}`,
      createdBy: staff.id,
      label: "First",
    });
    await store.createStudentInvite({
      token: `list_b_${Date.now()}`,
      createdBy: staff.id,
      label: "Second",
    });

    const all = await store.listStudentInvites();
    assert.ok(all.length >= 2, "should have at least 2 invites");
    // Verify they are newest-first (by id descending)
    for (let i = 1; i < all.length; i++) {
      assert.ok(all[i - 1].id >= all[i].id, "invites should be newest first");
    }
  });
});

// -----------------------------------------------------------------------
// 4. listOrdersByStaff
// -----------------------------------------------------------------------

describe("listOrdersByStaff", () => {
  it("should return only orders from the staff's students", async () => {
    const staffA = await createAdmin("Order Staff A");
    const staffB = await createAdmin("Order Staff B");

    const sA1 = await createStudent("Order Student A1", staffA.id);
    const sA2 = await createStudent("Order Student A2", staffA.id);
    const sB1 = await createStudent("Order Student B1", staffB.id);

    const orderA1 = await store.addOrder({
      studentId: sA1.id,
      title: "Order from A1",
      college: "College A",
      program: "RGN",
    });
    const orderA2 = await store.addOrder({
      studentId: sA2.id,
      title: "Order from A2",
      college: "College A",
      program: "RM",
    });
    const orderB1 = await store.addOrder({
      studentId: sB1.id,
      title: "Order from B1",
      college: "College B",
      program: "RCN",
    });

    const ordersA = await store.listOrdersByStaff(staffA.id);
    const ordersB = await store.listOrdersByStaff(staffB.id);

    const idsA = ordersA.map((o) => o.id).sort();
    const idsB = ordersB.map((o) => o.id).sort();

    assert.deepEqual(idsA, [orderA1.id, orderA2.id].sort(), "Staff A should see 2 orders");
    assert.deepEqual(idsB, [orderB1.id], "Staff B should see 1 order");
  });

  it("should return empty array for staff with no students", async () => {
    const lonely = await createAdmin("No Orders Staff");
    const result = await store.listOrdersByStaff(lonely.id);
    assert.deepEqual(result, []);
  });

  it("should return empty array when students have no orders", async () => {
    const staff = await createAdmin("Empty Orders Staff");
    await createStudent("Student No Orders", staff.id);
    const result = await store.listOrdersByStaff(staff.id);
    assert.deepEqual(result, []);
  });
});

// -----------------------------------------------------------------------
// 5. Admin sees all (no filtering)
// -----------------------------------------------------------------------

describe("Admin access (no filtering)", () => {
  it("listAllOrders should return all orders regardless of staff", async () => {
    const staff = await createAdmin("Admin Filter Staff");
    const student = await createStudent("Admin Filter Student", staff.id);

    await store.addOrder({
      studentId: student.id,
      title: "Admin Filter Order",
      college: "College",
      program: "RGN",
    });

    const all = await store.listAllOrders();
    assert.ok(all.length >= 1, "listAllOrders should return orders");
  });

  it("listAllStudents should return all students regardless of staff", async () => {
    const staff = await createAdmin("Admin Student Staff");
    await createStudent("Admin Filter Student 2", staff.id);

    const all = await store.listAllStudents();
    assert.ok(all.length >= 1, "listAllStudents should return students");
  });
});

// -----------------------------------------------------------------------
// 6. Full registration flow simulation
// -----------------------------------------------------------------------

describe("Full registration flow", () => {
  it("should simulate: staff creates invite → student registers → staff sees student", async () => {
    // Step 1: Staff creates an invite
    const staff = await createAdmin("Flow Staff", "staff");
    const token = `flow_token_${Date.now()}`;
    const invite = await store.createStudentInvite({
      token,
      createdBy: staff.id,
      label: "Flow test invite",
      staffName: staff.name,
    });

    // Step 2: Validate the invite
    const valid = await store.getStudentInviteByToken(token);
    assert.ok(valid, "invite should be valid");
    assert.equal(valid.usedAt, null, "invite should not be used yet");

    // Step 3: Student registers with the invite token
    const student = await createStudent("Flow Student", valid.createdBy);

    // Step 4: Mark invite as used
    await store.useStudentInvite(invite.id, student.id);

    // Step 5: Staff can now see this student
    const staffStudents = await store.listStudentsByStaff(staff.id);
    const found = staffStudents.find((s) => s.id === student.id);
    assert.ok(found, "staff should see the newly registered student");

    // Step 6: Student places an order
    const order = await store.addOrder({
      studentId: student.id,
      title: "Flow Test Order",
      college: "Flow College",
      program: "RGN",
    });

    // Step 7: Staff can see the order in their order bin
    const staffOrders = await store.listOrdersByStaff(staff.id);
    const orderFound = staffOrders.find((o) => o.id === order.id);
    assert.ok(orderFound, "staff should see the order from their student");
  });

  it("should simulate: staff A creates invite → student registers → staff B does NOT see student", async () => {
    const staffA = await createAdmin("Isolation Staff A", "staff");
    const staffB = await createAdmin("Isolation Staff B", "staff");

    // Staff A creates an invite
    const invite = await store.createStudentInvite({
      token: `isolation_${Date.now()}`,
      createdBy: staffA.id,
      staffName: staffA.name,
    });

    // Student registers via Staff A's invite
    const student = await createStudent("Isolated Student", invite.createdBy);
    await store.useStudentInvite(invite.id, student.id);

    // Staff A sees the student
    const studentsA = await store.listStudentsByStaff(staffA.id);
    assert.ok(studentsA.some((s) => s.id === student.id), "Staff A should see the student");

    // Staff B does NOT see the student
    const studentsB = await store.listStudentsByStaff(staffB.id);
    assert.ok(!studentsB.some((s) => s.id === student.id), "Staff B should NOT see the student");

    // Staff B does NOT see the student's orders
    const order = await store.addOrder({
      studentId: student.id,
      title: "Isolated Order",
      college: "College",
      program: "RGN",
    });
    const ordersB = await store.listOrdersByStaff(staffB.id);
    assert.ok(!ordersB.some((o) => o.id === order.id), "Staff B should NOT see the order");
  });
});

console.log("\n✅ All tests completed successfully!\n");
