import test from "node:test";
import assert from "node:assert/strict";
import {
  recalculateCourseEnrolment,
  parseCoursesFile,
  parseCsvRows,
  applyApprovedAction,
  reducer,
  audit,
  isSelfRequest,
  personName,
  normalizePersonName,
} from "../src/courseLogic.js";

const sampleStudents = [
  { id: "s01", name: "Avery Chen" },
  { id: "s02", name: "Jordan Patel" },
  { id: "s03", name: "Morgan Lee" },
  { id: "s04", name: "Riley Nguyen" },
  { id: "s05", name: "Casey Taylor" },
  { id: "s06", name: "Quinn Wilson" },
];

const samplePanel = [
  { id: "approver-1", name: "Dr. Amara Okafor", title: "Head of School" },
  { id: "approver-2", name: "Sam Williams", title: "Academic Advisor" },
  { id: "approver-3", name: "Alex Morgan", title: "Student Representative" },
];

function createInitialState() {
  return {
    courses: [
      {
        id: "comp3100",
        code: "COMP3100",
        name: "Applied AI",
        capacity: 3,
        enrolled: ["s01", "s02", "s03"],
        waitlist: ["s04", "s05", "s06"],
      },
      {
        id: "isys3414",
        code: "ISYS3414",
        name: "Database Systems",
        capacity: 4,
        enrolled: ["s01", "s02"],
        waitlist: [],
      },
    ],
    students: sampleStudents,
    panel: samplePanel,
    requests: [],
    audit: [],
  };
}

// -------------------------------------------------------------
// R2: Real-time Course Seat Management & FIFO Recalculation Tests
// -------------------------------------------------------------

test("recalculateCourseEnrolment - promotes students from waitlist in FIFO order when capacity increases", () => {
  const course = {
    id: "comp3100",
    code: "COMP3100",
    name: "Applied AI",
    capacity: 3,
    enrolled: ["s01", "s02", "s03"],
    waitlist: ["s04", "s05", "s06"],
  };

  // Increase capacity from 3 to 4
  const updated1 = recalculateCourseEnrolment({ ...course, capacity: 4 });
  assert.equal(updated1.capacity, 4);
  assert.deepEqual(updated1.enrolled, ["s01", "s02", "s03", "s04"]);
  assert.deepEqual(updated1.waitlist, ["s05", "s06"]);

  // Increase capacity by 2 more (to 6)
  const updated2 = recalculateCourseEnrolment({ ...updated1, capacity: 6 });
  assert.equal(updated2.capacity, 6);
  assert.deepEqual(updated2.enrolled, ["s01", "s02", "s03", "s04", "s05", "s06"]);
  assert.deepEqual(updated2.waitlist, []);
});

test("recalculateCourseEnrolment - handles deduplication between enrolled and waitlist", () => {
  const course = {
    id: "cosc101",
    code: "COSC101",
    name: "Intro CS",
    capacity: 2,
    enrolled: ["s01", "s01", "s02"],
    waitlist: ["s02", "s03"],
  };

  const updated = recalculateCourseEnrolment(course);
  assert.deepEqual(updated.enrolled, ["s01", "s02"]);
  assert.deepEqual(updated.waitlist, ["s03"]);
});

test("recalculateCourseEnrolment - enforces minimum capacity of 1", () => {
  const course = {
    id: "test",
    code: "TEST1",
    name: "Test",
    capacity: 0,
    enrolled: [],
    waitlist: ["s01"],
  };

  const updated = recalculateCourseEnrolment(course);
  assert.equal(updated.capacity, 1);
  assert.deepEqual(updated.enrolled, ["s01"]);
  assert.deepEqual(updated.waitlist, []);
});

test("reducer capacity event - increases seat limit, recalculates FIFO queue, and logs audit event in real time", () => {
  const state = createInitialState();
  const next = reducer(state, {
    type: "capacity",
    courseId: "comp3100",
    capacity: 4,
    actor: "Taylor Reed",
  });

  const comp3100 = next.courses.find((c) => c.id === "comp3100");
  assert.equal(comp3100.capacity, 4);
  assert.deepEqual(comp3100.enrolled, ["s01", "s02", "s03", "s04"]);
  assert.deepEqual(comp3100.waitlist, ["s05", "s06"]);

  // Verify audit entry
  assert.equal(next.audit.length, 1);
  const event = next.audit[0];
  assert.equal(event.actor, "Taylor Reed");
  assert.equal(event.action, "Seat limit updated");
  assert.match(event.reason, /COMP3100 seat limit adjusted from 3 to 4/);
  assert.match(event.reason, /Promoted Riley Nguyen from waitlist in FIFO order/);
});

// -------------------------------------------------------------
// R2: Batch Upload Parsing & Merge Tests
// -------------------------------------------------------------

test("parseCoursesFile - parses JSON array of courses", () => {
  const json = JSON.stringify([
    { code: "CS101", name: "Intro to CS", capacity: 25 },
    { code: "CS102", name: "Data Structures", capacity: 20 },
  ]);

  const courses = parseCoursesFile(json, "courses.json");
  assert.equal(courses.length, 2);
  assert.equal(courses[0].code, "CS101");
  assert.equal(courses[0].name, "Intro to CS");
  assert.equal(courses[0].capacity, 25);
  assert.equal(courses[1].code, "CS102");
});

test("parseCoursesFile - parses JSON object containing courses array", () => {
  const json = JSON.stringify({
    courses: [
      { code: "CYBER201", name: "Network Defense", capacity: 15, enrolled: ["s01"], waitlist: ["s02"] },
    ],
  });

  const courses = parseCoursesFile(json, "catalog.json");
  assert.equal(courses.length, 1);
  assert.equal(courses[0].code, "CYBER201");
  assert.equal(courses[0].capacity, 15);
  assert.deepEqual(courses[0].enrolled, ["s01"]);
  assert.deepEqual(courses[0].waitlist, ["s02"]);
});

test("parseCoursesFile - parses CSV format", () => {
  const csv = `code,name,capacity
COSC2801,Advanced Cloud Architectures,4
COSC2802,Decentralized Governance & Cryptography,3`;

  const courses = parseCoursesFile(csv, "courses.csv");
  assert.equal(courses.length, 2);
  assert.equal(courses[0].code, "COSC2801");
  assert.equal(courses[0].name, "Advanced Cloud Architectures");
  assert.equal(courses[0].capacity, 4);
  assert.equal(courses[1].code, "COSC2802");
  assert.equal(courses[1].capacity, 3);
});

test("parseCoursesFile - parses CSV with explicit enrolled and waitlist", () => {
  const csv = `Course Code,Course Name,Seat Limit,Enrolled,Waitlist
COSC3000,Machine Learning,3,s01;s02,s03;s04`;

  const courses = parseCoursesFile(csv, "classes.csv");
  assert.equal(courses.length, 1);
  assert.equal(courses[0].code, "COSC3000");
  assert.equal(courses[0].capacity, 3);
  assert.deepEqual(courses[0].enrolled, ["s01", "s02"]);
  assert.deepEqual(courses[0].waitlist, ["s03", "s04"]);
});

test("parseCoursesFile - throws on empty content or invalid input", () => {
  assert.throws(() => parseCoursesFile("", "empty.csv"), /Uploaded file is empty/);
  assert.throws(() => parseCoursesFile("   \n  ", "empty.json"), /Uploaded file is empty/);
  assert.throws(() => parseCoursesFile("code,name,capacity", "one_line.csv"), /at least one data row/);
});

test("reducer batch_upload event - merges into existing catalog, adds new courses, and logs audit", () => {
  const state = createInitialState();
  const batchCsv = `code,name,capacity
COMP3100,Applied Artificial Intelligence,5
COSC9999,Quantum Computing,4`;

  const parsed = parseCoursesFile(batchCsv, "batch.csv");
  const next = reducer(state, {
    type: "batch_upload",
    courses: parsed,
    fileName: "batch.csv",
    actor: "Taylor Reed",
  });

  // COMP3100 should be updated and FIFO recalculated (promoted s04 and s05!)
  const comp3100 = next.courses.find((c) => c.code === "COMP3100");
  assert.equal(comp3100.capacity, 5);
  assert.deepEqual(comp3100.enrolled, ["s01", "s02", "s03", "s04", "s05"]);
  assert.deepEqual(comp3100.waitlist, ["s06"]);

  // COSC9999 should be added
  const cosc9999 = next.courses.find((c) => c.code === "COSC9999");
  assert.ok(cosc9999);
  assert.equal(cosc9999.capacity, 4);
  assert.equal(cosc9999.name, "Quantum Computing");

  // Total courses: 3 (2 existing + 1 new)
  assert.equal(next.courses.length, 3);

  // Audit entry recorded
  assert.equal(next.audit.length, 1);
  assert.equal(next.audit[0].action, "Batch catalog upload");
  assert.match(next.audit[0].reason, /batch\.csv/);
  assert.match(next.audit[0].reason, /1 course\(s\) added, 1 course\(s\) updated/);
});

// -------------------------------------------------------------
// R3: Quorum Integrity & 2-of-3 Consensus Tests
// -------------------------------------------------------------

test("quorum enforcement - requires 2-of-3 approvals before applying exception", () => {
  const state = createInitialState();

  // 1. Submit a force enrol request
  const state1 = reducer(state, {
    type: "request",
    request: {
      kind: "force",
      requester: "Taylor Reed",
      courseId: "comp3100",
      studentId: "s04",
      reason: "Medical accessibility accommodation.",
    },
  });

  assert.equal(state1.requests.length, 1);
  const reqId = state1.requests[0].id;
  assert.equal(state1.requests[0].status, "pending");
  assert.equal(state1.requests[0].approvals.length, 0);

  // Before approval, s04 is still in waitlist, not enrolled
  const courseBefore = state1.courses.find((c) => c.id === "comp3100");
  assert.ok(!courseBefore.enrolled.includes("s04"));
  assert.ok(courseBefore.waitlist.includes("s04"));

  // 2. First vote from Dr. Amara Okafor (1 of 2)
  const state2 = reducer(state1, {
    type: "vote",
    requestId: reqId,
    approver: samplePanel[0],
  });

  assert.equal(state2.requests[0].status, "pending");
  assert.equal(state2.requests[0].approvals.length, 1);
  // Course should NOT be modified yet!
  const courseAfter1Vote = state2.courses.find((c) => c.id === "comp3100");
  assert.ok(!courseAfter1Vote.enrolled.includes("s04"));

  // 3. Second vote from Sam Williams (2 of 2 - Quorum reached!)
  const state3 = reducer(state2, {
    type: "vote",
    requestId: reqId,
    approver: samplePanel[1],
  });

  assert.equal(state3.requests[0].status, "approved");
  assert.equal(state3.requests[0].approvals.length, 2);

  // Now s04 must be enrolled!
  const courseAfter2Votes = state3.courses.find((c) => c.id === "comp3100");
  assert.ok(courseAfter2Votes.enrolled.includes("s04"));
  assert.ok(!courseAfter2Votes.waitlist.includes("s04"));

  // Verify audit log has quorum approval event
  const quorumEvent = state3.audit.find((e) => e.action === "Exception approved and applied");
  assert.ok(quorumEvent);
  assert.match(quorumEvent.reason, /Dr\. Amara Okafor and Sam Williams/);
});

test("quorum enforcement - prevents requester self-approval and duplicate voting", () => {
  const state = createInitialState();

  // Panel member Dr. Amara Okafor submits request
  const state1 = reducer(state, {
    type: "request",
    request: {
      kind: "force",
      requester: samplePanel[0].name,
      courseId: "comp3100",
      studentId: "s05",
      reason: "Self request",
    },
  });

  const reqId = state1.requests[0].id;

  // Dr. Amara attempts to approve own request
  const state2 = reducer(state1, {
    type: "vote",
    requestId: reqId,
    approver: samplePanel[0],
  });

  assert.equal(state2.requests[0].approvals.length, 0);
  assert.equal(state2.audit[0].action, "Approval blocked");

  // Sam Williams votes once
  const state3 = reducer(state2, {
    type: "vote",
    requestId: reqId,
    approver: samplePanel[1],
  });
  assert.equal(state3.requests[0].approvals.length, 1);

  // Sam Williams attempts to vote a second time
  const state4 = reducer(state3, {
    type: "vote",
    requestId: reqId,
    approver: samplePanel[1],
  });
  assert.equal(state4.requests[0].approvals.length, 1);
  assert.equal(state4.audit[0].action, "Approval blocked");
});

test("quorum enforcement - deny request updates status and logs rationale", () => {
  const state = createInitialState();
  const state1 = reducer(state, {
    type: "request",
    request: {
      kind: "jump",
      requester: "Taylor Reed",
      courseId: "comp3100",
      studentId: "s06",
      reason: "Unsubstantiated request",
    },
  });

  const reqId = state1.requests[0].id;
  const state2 = reducer(state1, {
    type: "deny",
    requestId: reqId,
    actor: samplePanel[0].name,
    reason: "Insufficient academic justification.",
  });

  assert.equal(state2.requests[0].status, "denied");
  const denyEvent = state2.audit.find((e) => e.action === "Exception denied");
  assert.ok(denyEvent);
  assert.match(denyEvent.reason, /Insufficient academic justification/);
});

test("parseCoursesFile - handles semicolon-delimited CSV and tab-delimited files", () => {
  const semiCsv = `code;name;capacity
ISYS100;Cloud Foundations;10
ISYS200;Network Security;8`;

  const courses1 = parseCoursesFile(semiCsv, "courses.csv");
  assert.equal(courses1.length, 2);
  assert.equal(courses1[0].code, "ISYS100");
  assert.equal(courses1[0].capacity, 10);
  assert.equal(courses1[1].code, "ISYS200");

  const tabCsv = "code\tname\tcapacity\nCOSC500\tDistributed Systems\t6";
  const courses2 = parseCoursesFile(tabCsv, "courses.tsv");
  assert.equal(courses2.length, 1);
  assert.equal(courses2[0].code, "COSC500");
  assert.equal(courses2[0].capacity, 6);
});

test("recalculateCourseEnrolment - capacity reduction below enrolled preserves enrolled and has 0 open seats", () => {
  const course = {
    id: "c1",
    code: "C1",
    name: "Course 1",
    capacity: 5,
    enrolled: ["s01", "s02", "s03"],
    waitlist: ["s04"],
  };

  const updated = recalculateCourseEnrolment({ ...course, capacity: 2 });
  assert.equal(updated.capacity, 2);
  assert.deepEqual(updated.enrolled, ["s01", "s02", "s03"]);
  assert.deepEqual(updated.waitlist, ["s04"]);
  const available = Math.max(0, updated.capacity - updated.enrolled.length);
  assert.equal(available, 0);
});

test("reducer enrol event - prevents duplicate enrollment and duplicate waitlist", () => {
  const state = createInitialState();

  // s01 is already enrolled in comp3100
  const next1 = reducer(state, {
    type: "enrol",
    courseId: "comp3100",
    studentId: "s01",
    studentName: "Avery Chen",
    actor: "Avery Chen",
  });
  // State should be unchanged
  assert.equal(next1, state);

  // s04 is already waitlisted in comp3100
  const next2 = reducer(state, {
    type: "enrol",
    courseId: "comp3100",
    studentId: "s04",
    studentName: "Riley Nguyen",
    actor: "Riley Nguyen",
  });
  // State should be unchanged
  assert.equal(next2, state);
});

test("quorum enforcement - non-panel member cannot vote", () => {
  const state = createInitialState();
  const state1 = reducer(state, {
    type: "request",
    request: {
      kind: "force",
      requester: "Taylor Reed",
      courseId: "comp3100",
      studentId: "s05",
      reason: "Urgent need",
    },
  });

  const reqId = state1.requests[0].id;
  const fakeApprover = { id: "fake-1", name: "Rogue Impersonator", title: "None" };

  const state2 = reducer(state1, {
    type: "vote",
    requestId: reqId,
    approver: fakeApprover,
  });

  assert.equal(state2.requests[0].approvals.length, 0);
  assert.equal(state2.audit[0].action, "Approval blocked");
});

test("quorum enforcement - panel candidate replacement replaces panel member upon 2-of-3 quorum", () => {
  const state = createInitialState();
  const newCandidate = { id: "s05", name: "Casey Taylor", title: "Student Representative" };
  const replaceMember = samplePanel[2]; // Alex Morgan

  const state1 = reducer(state, {
    type: "request",
    request: {
      kind: "panel",
      requester: "Taylor Reed",
      candidate: newCandidate,
      replaceMember,
      reason: "Term expired; replacing student representative.",
    },
  });

  const reqId = state1.requests[0].id;

  // Vote 1
  const state2 = reducer(state1, {
    type: "vote",
    requestId: reqId,
    approver: samplePanel[0],
  });
  assert.equal(state2.panel.length, 3);
  assert.ok(state2.panel.some((m) => m.id === replaceMember.id));

  // Vote 2 (quorum reached!)
  const state3 = reducer(state2, {
    type: "vote",
    requestId: reqId,
    approver: samplePanel[1],
  });

  assert.equal(state3.requests[0].status, "approved");
  assert.equal(state3.panel.length, 3);
  assert.ok(!state3.panel.some((m) => m.id === replaceMember.id));
  assert.ok(state3.panel.some((m) => m.id === "s05"));
});

// -------------------------------------------------------------
// Adversarial Review Edge Cases & Robustness
// -------------------------------------------------------------

test("parseCoursesFile - correctly handles CSV where Course Name column precedes Course Code column", () => {
  const csv = "Course Name,Course Code,Capacity\nDatabase Systems,ISYS3414,4";
  const res = parseCoursesFile(csv, "test.csv");
  assert.equal(res[0].code, "ISYS3414");
  assert.equal(res[0].name, "Database Systems");
  assert.equal(res[0].capacity, 4);
});

test("parseCoursesFile - parses JSON with UTF-8 BOM", () => {
  const jsonBOM = "\uFEFF" + JSON.stringify([{ code: "CS100", name: "Intro", capacity: 10 }]);
  const res = parseCoursesFile(jsonBOM, "test.json");
  assert.equal(res[0].code, "CS100");
});

test("parseCoursesFile - parses CSV with escaped quotes in field names according to RFC 4180", () => {
  const csv = 'code,name,capacity\nCS200,"Special ""Deep"" Topics",5';
  const res = parseCoursesFile(csv, "test.csv");
  assert.equal(res[0].name, 'Special "Deep" Topics');
});

test("parseCoursesFile - safely filters null and empty items in JSON array", () => {
  const jsonNull = JSON.stringify([null, { code: "CS300", name: "AI", capacity: 5 }]);
  const res = parseCoursesFile(jsonNull, "test.json");
  assert.equal(res.length, 1);
  assert.equal(res[0].code, "CS300");
});

test("quorum enforcement - vote event with null approver does not throw uncaught TypeError", () => {
  const state = {
    courses: [],
    students: [],
    panel: [{ id: "p1", name: "Dr. Amara" }],
    requests: [{ id: "r1", requester: "Taylor", status: "pending", approvals: [] }],
    audit: [],
  };
  assert.doesNotThrow(() => {
    reducer(state, { type: "vote", requestId: "r1", approver: null });
  });
});

test("parseCoursesFile - parses CSV with multiline field in quotes", () => {
  const csv = 'code,name,capacity\nCS101,"Line 1\nLine 2",3';
  const res = parseCoursesFile(csv, "test.csv");
  assert.equal(res.length, 1);
  assert.equal(res[0].code, "CS101");
  assert.equal(res[0].name, "Line 1\nLine 2");
});

test("quorum enforcement - panel replacement prevents duplicate candidate if candidate already in panel", () => {
  const panel = [
    { id: "p1", name: "Dr. Amara" },
    { id: "p2", name: "Sam Williams" },
    { id: "p3", name: "Alex Morgan" },
  ];
  const state = { panel, courses: [] };
  const res = applyApprovedAction(state, {
    kind: "panel",
    replaceMember: { id: "p3" },
    candidate: { id: "p2", name: "Sam Williams" },
  });
  const p2Count = res.panel.filter((m) => m.id === "p2").length;
  assert.equal(p2Count, 1);
  assert.equal(res.panel.length, 2);
});

test("quorum enforcement - jump exception promotes student if capacity opens up", () => {
  const course = {
    id: "c1",
    code: "C1",
    capacity: 2,
    enrolled: ["s1"],
    waitlist: ["s2"],
  };
  const state = { panel: [], courses: [course] };
  const res = applyApprovedAction(state, {
    kind: "jump",
    courseId: "c1",
    studentId: "s3",
  });
  // Since capacity is 2 and enrolled was 1, s3 jumps and gets enrolled!
  assert.equal(res.courses[0].enrolled.length, 2);
  assert.ok(res.courses[0].enrolled.includes("s3"));
});

test("parseCoursesFile - CSV with Course,Capacity,Description does not set name to capacity number", () => {
  const csv = "Course,Capacity,Description\nCS101,4,Introduction to Computer Science";
  const res = parseCoursesFile(csv, "courses.csv");
  assert.equal(res[0].code, "CS101");
  assert.equal(res[0].capacity, 4);
  assert.equal(res[0].name, "Introduction to Computer Science");
});

test("parseCoursesFile - CSV with Course,Capacity falls back name to code rather than capacity", () => {
  const csv = "Course,Capacity\nCS101,4";
  const res = parseCoursesFile(csv, "courses.csv");
  assert.equal(res[0].code, "CS101");
  assert.equal(res[0].capacity, 4);
  assert.equal(res[0].name, "CS101");
});

test("parseCoursesFile - JSON and CSV with capacity 0 clamp to minimum capacity 1 without defaulting to 3", () => {
  const json = JSON.stringify([{ code: "CS105", name: "Algorithms", capacity: 0 }]);
  const resJson = parseCoursesFile(json, "test.json");
  assert.equal(resJson[0].capacity, 1);

  const csv = "code,name,capacity\nCS105,Algorithms,0";
  const resCsv = parseCoursesFile(csv, "test.csv");
  assert.equal(resCsv[0].capacity, 1);
});

test("parseCoursesFile - parses wrapped JSON formats (result, payload, data.courses)", () => {
  const jsonWithResult = JSON.stringify({ result: [{ code: "COSC1", name: "Course 1", capacity: 5 }] });
  const res1 = parseCoursesFile(jsonWithResult, "test.json");
  assert.equal(res1.length, 1);
  assert.equal(res1[0].code, "COSC1");

  const jsonWithDataCourses = JSON.stringify({ data: { courses: [{ code: "COSC2", name: "Course 2", capacity: 4 }] } });
  const res2 = parseCoursesFile(jsonWithDataCourses, "test.json");
  assert.equal(res2.length, 1);
  assert.equal(res2[0].code, "COSC2");
});

test("quorum enforcement - prevents requester self-approval with case-insensitive check and actorId", () => {
  const state = createInitialState();
  const state1 = reducer(state, {
    type: "request",
    request: {
      kind: "force",
      requester: "Dr. Amara Okafor",
      requesterId: "sub-101",
      approverId: "approver-1",
      approverName: "Dr. Amara Okafor",
      courseId: "comp3100",
      studentId: "s04",
      reason: "Special consideration",
    },
  });

  const reqId = state1.requests[0].id;

  // Case-insensitive name match attempt
  const state2 = reducer(state1, {
    type: "vote",
    requestId: reqId,
    approver: { id: "approver-1", name: "dr. amara okafor" },
  });
  assert.equal(state2.requests[0].approvals.length, 0);
  assert.equal(state2.audit[0].action, "Approval blocked");

  // ActorId match attempt (e.g. authenticated user ID matches requesterId)
  const state3 = reducer(state1, {
    type: "vote",
    requestId: reqId,
    approver: samplePanel[0],
    actorId: "sub-101",
  });
  assert.equal(state3.requests[0].approvals.length, 0);
  assert.equal(state3.audit[0].action, "Approval blocked");
});

test("quorum enforcement - isSelfRequest accurately blocks requester from voting on own request", () => {
  const request = {
    requester: "Taylor Reed",
    requesterId: "reg-1",
    approverId: "approver-1",
    approverName: "Dr. Amara Okafor",
  };

  assert.ok(isSelfRequest(request, { id: "approver-1", name: "Dr. Amara Okafor" }, { id: "reg-1", name: "Taylor Reed" }));
  assert.ok(isSelfRequest(request, { id: "approver-2", name: "Sam Williams" }, { id: "reg-1", name: "Taylor Reed" }));
  assert.ok(isSelfRequest(request, { id: "approver-1", name: "dr. amara okafor" }, null));
  assert.ok(!isSelfRequest(request, { id: "approver-2", name: "Sam Williams" }, { id: "other", name: "Other User" }));
});

test("reducer enrol event - missing studentName falls back to personName instead of undefined", () => {
  const state = createInitialState();
  const next = reducer(state, {
    type: "enrol",
    courseId: "isys3414",
    studentId: "s03",
    actor: "s03",
  });

  const enrolAudit = next.audit.find((e) => e.action === "Enrolment recorded");
  assert.ok(enrolAudit);
  assert.ok(!enrolAudit.reason.includes("undefined"));
  assert.match(enrolAudit.reason, /Morgan Lee enrolled in ISYS3414/);
});

test("audit - safely records object actor without [object Object]", () => {
  const state = createInitialState();
  const next = audit(state, { id: "reg-1", name: "Registrar Officer" }, "Config updated", "Test reason");
  assert.equal(next.audit[0].actor, "Registrar Officer");
  assert.ok(!next.audit[0].actor.includes("object"));
});

test("quorum enforcement - force enrol exception promotes waitlist if open seats exist", () => {
  const course = {
    id: "test-c",
    code: "TEST100",
    capacity: 3,
    enrolled: ["s01"],
    waitlist: ["s02"],
  };
  const state = { courses: [course], panel: [] };
  const res = applyApprovedAction(state, {
    kind: "force",
    courseId: "test-c",
    studentId: "s03",
  });

  // s03 was force enrolled (enrolled: s01, s03). Capacity is 3, so s02 should be promoted from waitlist!
  const updatedCourse = res.courses[0];
  assert.equal(updatedCourse.enrolled.length, 3);
  assert.deepEqual(updatedCourse.enrolled, ["s01", "s03", "s02"]);
  assert.deepEqual(updatedCourse.waitlist, []);
});

test("parseCoursesFile - JSON with enrolled & waitlist as object arrays extracts IDs instead of [object Object]", () => {
  const json = JSON.stringify([
    {
      code: "COSC4001",
      name: "Distributed Consensus",
      capacity: 4,
      enrolled: [{ id: "s01", name: "Avery Chen" }, { studentId: "s02" }],
      waitlist: [{ id: "s03", name: "Morgan Lee" }],
    },
  ]);

  const courses = parseCoursesFile(json, "test.json");
  assert.equal(courses.length, 1);
  assert.deepEqual(courses[0].enrolled, ["s01", "s02"]);
  assert.deepEqual(courses[0].waitlist, ["s03"]);
  assert.ok(!courses[0].enrolled.includes("[object Object]"));
  assert.ok(!courses[0].waitlist.includes("[object Object]"));
});

test("parseCoursesFile - JSON with enrolled as comma-separated string parses into list of student IDs", () => {
  const json = JSON.stringify([
    {
      code: "COSC4002",
      name: "Smart Contract Auditing",
      capacity: 5,
      enrolled: "s01, s02; s03",
      waitlist: "s04|s05",
    },
  ]);

  const courses = parseCoursesFile(json, "test.json");
  assert.deepEqual(courses[0].enrolled, ["s01", "s02", "s03"]);
  assert.deepEqual(courses[0].waitlist, ["s04", "s05"]);
});

test("quorum enforcement - prevents self-approval when requester has title Dr. but approver has plain token name", () => {
  const state = createInitialState();
  const state1 = reducer(state, {
    type: "request",
    request: {
      kind: "force",
      requester: "Dr. Amara Okafor",
      requesterId: "sub-101",
      courseId: "comp3100",
      studentId: "s04",
      reason: "Research grant requirement",
    },
  });

  const reqId = state1.requests[0].id;

  // Voter authenticates with token name "Amara Okafor" (without "Dr.")
  const state2 = reducer(state1, {
    type: "vote",
    requestId: reqId,
    approver: { id: "approver-1", name: "Amara Okafor" },
  });

  assert.equal(state2.requests[0].approvals.length, 0);
  assert.equal(state2.audit[0].action, "Approval blocked");
  assert.match(state2.audit[0].reason, /Requester cannot approve their own request/);

  // isSelfRequest helper also recognizes title-insensitive match
  const reqObj = state1.requests[0];
  assert.ok(isSelfRequest(reqObj, { id: "approver-1", name: "Amara Okafor" }, { id: "sub-101", name: "Amara Okafor" }));
});

test("recalculateCourseEnrolment - cleans out null, undefined, and empty string elements and promotes waitlisted student", () => {
  const course = {
    id: "c1",
    code: "C1",
    name: "Course 1",
    capacity: 3,
    enrolled: ["s01", null, "", undefined],
    waitlist: [null, "s02", ""],
  };

  const updated = recalculateCourseEnrolment(course);
  assert.equal(updated.capacity, 3);
  assert.deepEqual(updated.enrolled, ["s01", "s02"]);
  assert.deepEqual(updated.waitlist, []);
});

test("parseCsvRows - correctly identifies semicolon delimiter when header field contains a comma inside quotes", () => {
  const csv = '"Course, Code";"Course Name";"Capacity"\n"CS101";"Intro";"5"';
  const rows = parseCsvRows(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 3);
  assert.equal(rows[0][0], "Course, Code");
  assert.equal(rows[0][1], "Course Name");
  assert.equal(rows[0][2], "Capacity");
  assert.equal(rows[1][0], "CS101");
  assert.equal(rows[1][1], "Intro");
  assert.equal(rows[1][2], "5");
});

test("reducer batch_upload - safely handles empty courses array and clamps capacity <= 0 to 1", () => {
  const state = createInitialState();
  const next1 = reducer(state, { type: "batch_upload", courses: [] });
  assert.equal(next1, state);

  const next2 = reducer(state, {
    type: "batch_upload",
    courses: [{ id: "new1", code: "NEW1", name: "New Course", capacity: 0 }],
    fileName: "test.csv",
    actor: "Registrar",
  });
  const newCourse = next2.courses.find((c) => c.code === "NEW1");
  assert.ok(newCourse);
  assert.equal(newCourse.capacity, 1);
});

test("normalizePersonName - strips academic/honorific titles and non-alphanumeric chars", () => {
  assert.equal(normalizePersonName("Dr. Amara Okafor"), "amaraokafor");
  assert.equal(normalizePersonName("Prof. Sam Williams"), "samwilliams");
  assert.equal(normalizePersonName("Dean Taylor Reed"), "taylorreed");
  assert.equal(normalizePersonName("Ms. Avery Chen"), "averychen");
  assert.equal(normalizePersonName("Mr. Alex Morgan"), "alexmorgan");
  assert.equal(normalizePersonName(""), "");
});


