export const actionNames = {
  force: "Force enrol",
  jump: "Jump the queue",
  remove: "Remove a student",
  panel: "Change approver panel",
};

export function personName(state, id) {
  return state.students.find((student) => student.id === id)?.name ?? id;
}

export function audit(state, actor, action, reason) {
  const safeActor = (typeof actor === "object" && actor !== null ? actor.name : actor) || "System";
  return {
    ...state,
    audit: [
      {
        id: `${Date.now()}-${Math.random()}`,
        time: new Date().toISOString(),
        actor: safeActor,
        action: action || "Event",
        reason: reason || "",
      },
      ...state.audit,
    ],
  };
}

export function normalizePersonName(name) {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .replace(/\b(dr|prof|professor|mr|ms|mrs|mx|dean)\b\.?/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function isSelfRequest(request, approver, currentActor) {
  if (!request) return false;
  const matchId = (a, b) => Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());
  const matchName = (a, b) => {
    if (!a || !b) return false;
    const strA = String(a).trim().toLowerCase();
    const strB = String(b).trim().toLowerCase();
    if (strA === strB) return true;
    const normA = normalizePersonName(a);
    const normB = normalizePersonName(b);
    if (!normA || !normB) return false;
    return normA === normB || (normA.length >= 4 && normB.length >= 4 && (normA.includes(normB) || normB.includes(normA)));
  };

  const reqNames = [request.requester, request.approverName].filter(Boolean);
  const reqIds = [request.requesterId, request.approverId].filter(Boolean);

  const checkNames = [approver?.name, currentActor?.name].filter(Boolean);
  const checkIds = [approver?.id, currentActor?.id].filter(Boolean);

  return (
    reqNames.some((rName) => checkNames.some((cName) => matchName(rName, cName))) ||
    reqIds.some((rId) => checkIds.some((cId) => matchId(rId, cId)))
  );
}

/**
 * Recalculates enrolment and FIFO waitlist according to course capacity.
 * Ensures:
 * 1. capacity >= 1 (integer)
 * 2. enrolled and waitlist are distinct, non-empty, and unique
 * 3. Any available open seats are filled by waitlisted students in FIFO order.
 */
export function recalculateCourseEnrolment(course) {
  const capacity = Math.max(1, Math.floor(Number(course.capacity)) || 1);
  let enrolled = Array.isArray(course.enrolled) ? [...course.enrolled] : [];
  let waitlist = Array.isArray(course.waitlist) ? [...course.waitlist] : [];

  enrolled = Array.from(new Set(enrolled.filter(Boolean)));
  waitlist = Array.from(new Set(waitlist.filter(Boolean))).filter((id) => !enrolled.includes(id));

  while (enrolled.length < capacity && waitlist.length > 0) {
    const nextStudent = waitlist.shift();
    enrolled.push(nextStudent);
  }

  return {
    ...course,
    capacity,
    enrolled,
    waitlist,
  };
}

export function parseCsvRows(text) {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return [];

  const firstLine = clean.split(/\r?\n/)[0];
  let delimiter = ",";

  let inQ = false;
  let semiCount = 0;
  let tabCount = 0;
  let commaCount = 0;
  for (let idx = 0; idx < firstLine.length; idx++) {
    const ch = firstLine[idx];
    if (ch === '"') {
      inQ = !inQ;
    } else if (!inQ) {
      if (ch === ";") semiCount++;
      else if (ch === "\t") tabCount++;
      else if (ch === ",") commaCount++;
    }
  }

  if (semiCount > commaCount && semiCount >= tabCount) {
    delimiter = ";";
  } else if (tabCount > commaCount && tabCount > semiCount) {
    delimiter = "\t";
  }

  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < clean.length) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < clean.length && clean[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = "";
        i++;
        continue;
      } else if (char === "\r") {
        if (i + 1 < clean.length && clean[i + 1] === "\n") {
          i++;
        }
        currentRow.push(currentField.trim());
        currentField = "";
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField.trim());
        currentField = "";
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  currentRow.push(currentField.trim());
  if (currentRow.some((f) => f.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

export function parseCoursesFile(content, fileName = "") {
  const trimmed = content.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    throw new Error("Uploaded file is empty.");
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      let rawList = [];
      if (Array.isArray(parsed)) {
        rawList = parsed;
      } else if (parsed && typeof parsed === "object") {
        rawList =
          parsed.courses ||
          parsed.classes ||
          parsed.catalog ||
          parsed.data?.courses ||
          parsed.data?.items ||
          parsed.result?.courses ||
          parsed.payload?.courses ||
          (Array.isArray(parsed.data) ? parsed.data : null) ||
          (Array.isArray(parsed.items) ? parsed.items : null) ||
          (Array.isArray(parsed.result) ? parsed.result : null) ||
          (Array.isArray(parsed.payload) ? parsed.payload : null) ||
          [];
      }
      if (!Array.isArray(rawList) || rawList.length === 0) {
        throw new Error("JSON file must contain an array of courses or a 'courses' array.");
      }
      const validItems = rawList.filter((item) => item && typeof item === "object");
      if (validItems.length === 0) {
        throw new Error("JSON file contains no valid course objects.");
      }
      return validItems.map((item, idx) => {
        const code = String(item.code || item.course_code || item.courseCode || item.id || `COURSE-${idx + 1}`).trim().toUpperCase();
        const name = String(item.name || item.course_name || item.courseName || item.title || item.description || code).trim();
        const rawCap = item.capacity ?? item.cap ?? item.limit ?? item.seats;
        let capacity = 3;
        if (rawCap !== undefined && rawCap !== null && String(rawCap).trim() !== "") {
          const parsedCap = parseInt(rawCap, 10);
          if (!isNaN(parsedCap)) {
            capacity = Math.max(1, parsedCap);
          }
        }

        const extractStudentId = (s) => {
          if (!s) return "";
          if (typeof s === "object") {
            return String(s.id || s.studentId || s.student_id || s.student || s.name || "").trim();
          }
          return String(s).trim();
        };

        let enrolled = [];
        let hasExplicitEnrolled = false;
        if (Array.isArray(item.enrolled)) {
          hasExplicitEnrolled = true;
          enrolled = item.enrolled.map(extractStudentId).filter(Boolean);
        } else if (typeof item.enrolled === "string" && item.enrolled.trim() !== "") {
          hasExplicitEnrolled = true;
          enrolled = item.enrolled.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
        }

        let waitlist = [];
        let hasExplicitWaitlist = false;
        if (Array.isArray(item.waitlist)) {
          hasExplicitWaitlist = true;
          waitlist = item.waitlist.map(extractStudentId).filter(Boolean);
        } else if (typeof item.waitlist === "string" && item.waitlist.trim() !== "") {
          hasExplicitWaitlist = true;
          waitlist = item.waitlist.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
        }

        const id = String(item.id || code.toLowerCase().replace(/[^a-z0-9]/g, "")).trim();
        return {
          id,
          code,
          name,
          capacity,
          enrolled,
          waitlist,
          hasExplicitEnrolled,
          hasExplicitWaitlist,
        };
      });
    } catch (err) {
      if (!fileName.toLowerCase().endsWith(".csv")) {
        throw new Error(`Invalid JSON format: ${err.message}`);
      }
    }
  }

  const rows = parseCsvRows(trimmed);
  if (rows.length < 2) {
    throw new Error("CSV file must contain a header row and at least one data row.");
  }

  const rawHeaders = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

  let codeIdx = rawHeaders.findIndex((h) => h === "code" || h === "coursecode" || h === "classcode" || h === "courseid" || h === "classid");
  if (codeIdx === -1) {
    codeIdx = rawHeaders.findIndex((h) => h.includes("code") && !h.includes("name") && !h.includes("title"));
  }
  if (codeIdx === -1) {
    codeIdx = rawHeaders.findIndex((h) => (h === "id" || h === "course" || h === "class") && !h.includes("name") && !h.includes("title"));
  }

  let capIdx = rawHeaders.findIndex((h) => h.includes("cap") || h.includes("limit") || h.includes("seat") || h.includes("max") || h.includes("size"));
  let enrolledIdx = rawHeaders.findIndex((h) => (h.includes("enrol") || h.includes("student")) && !h.includes("wait") && !h.includes("queue"));
  let waitlistIdx = rawHeaders.findIndex((h) => h.includes("wait") || h.includes("queue"));

  let nameIdx = rawHeaders.findIndex((h) => h === "name" || h === "coursename" || h === "classname" || h === "title" || h === "coursetitle" || h === "classtitle");
  if (nameIdx === -1) {
    nameIdx = rawHeaders.findIndex((h, idx) => idx !== codeIdx && (h.includes("name") || h.includes("title") || h.includes("desc") || h.includes("subject") || h.includes("topic") || h.includes("detail")) && !h.includes("user") && !h.includes("student"));
  }

  if (codeIdx === -1 && rawHeaders.length > 0) {
    codeIdx = [0, 1, 2].find((i) => i < rawHeaders.length && i !== capIdx && i !== enrolledIdx && i !== waitlistIdx) ?? 0;
  }
  if (nameIdx === -1) {
    nameIdx = rawHeaders.findIndex((_, idx) => idx !== codeIdx && idx !== capIdx && idx !== enrolledIdx && idx !== waitlistIdx);
  }

  const courses = [];
  for (let i = 1; i < rows.length; i++) {
    const fields = rows[i];
    if (!fields || fields.length === 0 || !fields[codeIdx]) continue;

    const rawCode = fields[codeIdx].trim();
    if (!rawCode) continue;

    const code = rawCode.toUpperCase();
    const name = (nameIdx >= 0 && fields[nameIdx]) ? fields[nameIdx].trim() : code;
    const capStr = (capIdx >= 0 && fields[capIdx]) ? fields[capIdx].trim() : "";
    let capacity = 3;
    if (capStr !== "") {
      const parsedCap = parseInt(capStr, 10);
      if (!isNaN(parsedCap)) {
        capacity = Math.max(1, parsedCap);
      }
    }

    let enrolled = [];
    let hasExplicitEnrolled = false;
    if (enrolledIdx >= 0 && fields[enrolledIdx]) {
      const val = fields[enrolledIdx].trim();
      if (val) {
        hasExplicitEnrolled = true;
        enrolled = val.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
      }
    }

    let waitlist = [];
    let hasExplicitWaitlist = false;
    if (waitlistIdx >= 0 && fields[waitlistIdx]) {
      const val = fields[waitlistIdx].trim();
      if (val) {
        hasExplicitWaitlist = true;
        waitlist = val.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
      }
    }

    const id = code.toLowerCase().replace(/[^a-z0-9]/g, "");
    courses.push({
      id,
      code,
      name,
      capacity,
      enrolled,
      waitlist,
      hasExplicitEnrolled,
      hasExplicitWaitlist,
    });
  }

  if (courses.length === 0) {
    throw new Error("No valid course records found in CSV.");
  }

  return courses;
}

export function applyApprovedAction(state, request) {
  if (request.kind === "panel") {
    return {
      ...state,
      panel: [
        ...state.panel.filter(
          (member) => member.id !== request.replaceMember.id && member.id !== request.candidate.id
        ),
        request.candidate,
      ],
    };
  }

  const courses = state.courses.map((course) => {
    if (course.id !== request.courseId) return course;
    const enrolled = course.enrolled.filter((id) => id !== request.studentId);
    const waitlist = course.waitlist.filter((id) => id !== request.studentId);
    if (request.kind === "force") {
      return recalculateCourseEnrolment({
        ...course,
        enrolled: [...enrolled, request.studentId],
        waitlist,
      });
    }
    if (request.kind === "jump") {
      return recalculateCourseEnrolment({
        ...course,
        enrolled,
        waitlist: [request.studentId, ...waitlist],
      });
    }
    if (request.kind === "remove") {
      return recalculateCourseEnrolment({ ...course, enrolled, waitlist });
    }
    return { ...course, enrolled, waitlist };
  });
  return { ...state, courses };
}

export function reducer(state, event) {
  if (event.type === "enrol") {
    const course = state.courses.find((item) => item.id === event.courseId);
    if (!course || course.enrolled.includes(event.studentId) || course.waitlist.includes(event.studentId)) return state;
    const hasSeat = course.enrolled.length < course.capacity;
    const courses = state.courses.map((item) => {
      if (item.id !== course.id) return item;
      return hasSeat
        ? { ...item, enrolled: [...item.enrolled, event.studentId] }
        : { ...item, waitlist: [...item.waitlist, event.studentId] };
    });
    const studentName = event.studentName || personName(state, event.studentId);
    return audit(
      { ...state, courses },
      event.actor,
      hasSeat ? "Enrolment recorded" : "Joined waitlist",
      hasSeat
        ? `${studentName} enrolled in ${course.code}.`
        : `${studentName} joined ${course.code}'s waitlist in FIFO order.`
    );
  }

  if (event.type === "capacity") {
    const course = state.courses.find((item) => item.id === event.courseId);
    if (!course) return state;
    const oldCapacity = course.capacity;
    const newCapacity = Math.max(1, Number(event.capacity) || 1);

    const updatedCourse = recalculateCourseEnrolment({
      ...course,
      capacity: newCapacity,
    });

    const courses = state.courses.map((item) => (item.id === course.id ? updatedCourse : item));
    const newlyPromoted = updatedCourse.enrolled.filter((id) => !course.enrolled.includes(id));
    const openSeats = Math.max(0, newCapacity - updatedCourse.enrolled.length);

    const rationale = newlyPromoted.length > 0
      ? `${course.code} seat limit adjusted from ${oldCapacity} to ${newCapacity}. Promoted ${newlyPromoted.map((id) => personName(state, id)).join(", ")} from waitlist in FIFO order.`
      : `${course.code} seat limit adjusted from ${oldCapacity} to ${newCapacity}. Capacity updated; ${openSeats} seat(s) open.`;

    return audit(
      { ...state, courses },
      event.actor,
      "Seat limit updated",
      rationale
    );
  }

  if (event.type === "batch_upload") {
    const incomingList = Array.isArray(event.courses) ? event.courses : [];
    if (incomingList.length === 0) return state;

    let nextCourses = [...state.courses];
    let addedCount = 0;
    let updatedCount = 0;

    incomingList.forEach((incoming) => {
      const existingIndex = nextCourses.findIndex(
        (c) => c.id === incoming.id || c.code.toUpperCase() === incoming.code.toUpperCase()
      );

      if (existingIndex >= 0) {
        const existing = nextCourses[existingIndex];
        const merged = {
          ...existing,
          name: incoming.name || existing.name,
          capacity: incoming.capacity !== undefined ? Math.max(1, Math.floor(Number(incoming.capacity)) || 1) : existing.capacity,
          enrolled: incoming.hasExplicitEnrolled ? incoming.enrolled : existing.enrolled,
          waitlist: incoming.hasExplicitWaitlist ? incoming.waitlist : existing.waitlist,
        };
        nextCourses[existingIndex] = recalculateCourseEnrolment(merged);
        updatedCount++;
      } else {
        const newCourse = recalculateCourseEnrolment({
          id: incoming.id || incoming.code.toLowerCase().replace(/[^a-z0-9]/g, ""),
          code: incoming.code.toUpperCase(),
          name: incoming.name || incoming.code,
          capacity: incoming.capacity !== undefined ? Math.max(1, Math.floor(Number(incoming.capacity)) || 1) : 3,
          enrolled: incoming.enrolled || [],
          waitlist: incoming.waitlist || [],
        });
        nextCourses.push(newCourse);
        addedCount++;
      }
    });

    const rationale = `Batch file "${event.fileName}" uploaded: ${addedCount} course(s) added, ${updatedCount} course(s) updated. Real-time capacities and FIFO queues recalculated.`;
    return audit(
      { ...state, courses: nextCourses },
      event.actor,
      "Batch catalog upload",
      rationale
    );
  }

  if (event.type === "blocked") {
    return audit(state, event.actor, "Blocked registrar override attempt", event.reason);
  }

  if (event.type === "request") {
    const actionLabel = actionNames[event.request?.kind] || "Exception";
    const request = { ...event.request, approvals: [], status: "pending", id: `${Date.now()}-${Math.random()}` };
    return audit(
      { ...state, requests: [request, ...state.requests] },
      request.requester,
      `${actionLabel} requested`,
      request.reason
    );
  }

  if (event.type === "vote") {
    const request = state.requests.find((item) => item.id === event.requestId);
    if (!request || request.status !== "pending") return state;
    if (!event.approver || !event.approver.id) {
      return audit(
        state,
        "Unknown Approver",
        "Approval blocked",
        "Missing or invalid approver credentials."
      );
    }
    const approverName = String(event.approver.name || event.approver.id).trim();
    const approverId = String(event.approver.id).trim();

    // Check if voter is active panel member
    if (!state.panel.some((member) => String(member.id).toLowerCase() === approverId.toLowerCase())) {
      return audit(
        state,
        approverName,
        "Approval blocked",
        "Only active panel members are authorized to vote on exceptions."
      );
    }

    // Check if voter already voted
    if (
      request.approvals.some(
        (member) =>
          String(member.id).toLowerCase() === approverId.toLowerCase() ||
          String(member.name || "").trim().toLowerCase() === approverName.toLowerCase()
      )
    ) {
      return audit(
        state,
        approverName,
        "Approval blocked",
        "Panel members may vote only once per exception request."
      );
    }

    // Check requester self-approval (case-insensitive and title-normalized across name and ID claims)
    const reqNames = [request.requester, request.approverName].filter(Boolean);
    const reqIds = [request.requesterId, request.approverId].filter(Boolean).map((id) => String(id).trim().toLowerCase());
    const voterNames = [approverName];
    const voterIds = [approverId.toLowerCase()];
    if (event.actorName) voterNames.push(String(event.actorName).trim());
    if (event.actorId) voterIds.push(String(event.actorId).trim().toLowerCase());

    const isSelfApproval =
      reqNames.some((rn) =>
        voterNames.some((vn) => {
          const strA = rn.trim().toLowerCase();
          const strB = vn.trim().toLowerCase();
          if (strA === strB) return true;
          const normA = normalizePersonName(rn);
          const normB = normalizePersonName(vn);
          return normA && normB && (normA === normB || (normA.length >= 4 && normB.length >= 4 && (normA.includes(normB) || normB.includes(normA))));
        })
      ) ||
      reqIds.some((ri) => voterIds.includes(ri));

    if (isSelfApproval) {
      return audit(
        state,
        approverName,
        "Approval blocked",
        "Requester cannot approve their own request; panel members may vote only once."
      );
    }

    const approvals = [...request.approvals, event.approver];
    const actionLabel = actionNames[request.kind] || "Exception";
    let next = audit(
      {
        ...state,
        requests: state.requests.map((item) => (item.id === request.id ? { ...item, approvals } : item)),
      },
      approverName,
      "Exception approval recorded",
      `Approval ${approvals.length} of 2 for ${actionLabel.toLowerCase()}: ${request.reason}`
    );
    if (approvals.length >= 2) {
      const approvedRequest = { ...request, approvals };
      next = applyApprovedAction(next, approvedRequest);
      next = {
        ...next,
        requests: next.requests.map((item) =>
          item.id === request.id ? { ...item, approvals, status: "approved" } : item
        ),
      };
      next = audit(
        next,
        "FairEnrol quorum consensus",
        "Exception approved and applied",
        `${actionLabel} approved by ${approvals.map((member) => member.name).join(" and ")}. Public reason: ${request.reason}`
      );
    }
    return next;
  }

  if (event.type === "deny") {
    const request = state.requests.find((item) => item.id === event.requestId);
    if (!request || request.status !== "pending") return state;
    const actorName = event.actor || "Panel Member";
    return audit(
      {
        ...state,
        requests: state.requests.map((item) => (item.id === request.id ? { ...item, status: "denied" } : item)),
      },
      actorName,
      "Exception denied",
      `${event.reason || "The panel declined this request."} Request reason: ${request.reason}`
    );
  }

  return state;
}
