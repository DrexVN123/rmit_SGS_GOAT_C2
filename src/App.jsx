import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTideCloak } from "@tidecloak/react";
import seed from "./seed.json";
import {
  actionNames,
  personName,
  recalculateCourseEnrolment,
  parseCoursesFile,
  reducer,
  isSelfRequest,
  normalizePersonName,
} from "./courseLogic.js";

const initialPanel = [
  { id: "approver-1", name: "Dr. Amara Okafor", title: "Head of School" },
  { id: "approver-2", name: "Sam Williams", title: "Academic Advisor" },
  { id: "approver-3", name: "Alex Morgan", title: "Student Representative" },
];

const demoRegistrar = { id: "registrar-1", name: "Taylor Reed", title: "Registrar" };

export default function App() {
  const { authenticated, isInitializing, isLoading, initError, login, logout, hasRealmRole, getValueFromToken } = useTideCloak();
  const [state, dispatch] = useReducer(reducer, {
    courses: seed.courses,
    students: seed.students,
    panel: initialPanel,
    requests: [],
    audit: [],
  });
  const [role, setRole] = useState("student");
  const [studentId, setStudentId] = useState(seed.students[0].id);
  const [approverId, setApproverId] = useState(initialPanel[0].id);
  const [selectedCourse, setSelectedCourse] = useState(seed.courses[0].id);
  const [requestKind, setRequestKind] = useState("force");
  const [targetStudent, setTargetStudent] = useState(seed.students[3].id);
  const [reason, setReason] = useState("Accessibility accommodation requires a seat in this course.");
  const [panelCandidate, setPanelCandidate] = useState(demoRegistrar.id);
  const [panelRemoval, setPanelRemoval] = useState(initialPanel[2].id);
  const [notice, setNotice] = useState("");
  const [batchNotice, setBatchNotice] = useState(null);

  useEffect(() => {
    if (location.pathname === "/auth/redirect" && !isInitializing) {
      history.replaceState(null, "", "/");
    }
  }, [isInitializing]);

  useEffect(() => {
    if (authenticated) {
      const realmAccess = getValueFromToken("realm_access");
      const roles = realmAccess && Array.isArray(realmAccess.roles) ? realmAccess.roles : [];
      const resourceAccess = getValueFromToken("resource_access");
      const clientRoles = (resourceAccess && resourceAccess["fairenrol-app"] && Array.isArray(resourceAccess["fairenrol-app"].roles))
        ? resourceAccess["fairenrol-app"].roles
        : [];
      const allRoles = [...roles, ...clientRoles];
      const username = (getValueFromToken("preferred_username") || "").toLowerCase();
      const email = (getValueFromToken("email") || "").toLowerCase();
      const fullName = (getValueFromToken("name") || "").toLowerCase();
      const givenName = (getValueFromToken("given_name") || "").toLowerCase();

      const hasRole = (roleName) => (typeof hasRealmRole === "function" && hasRealmRole(roleName)) || allRoles.includes(roleName);

      const isRegistrar =
        hasRole("registrar") ||
        hasRole("admin") ||
        username.includes("registrar") ||
        email.includes("registrar") ||
        fullName.includes("registrar");

      const isApprover =
        hasRole("approver") ||
        username.includes("approver") ||
        email.includes("approver") ||
        fullName.includes("approver");

      if (isRegistrar) {
        setRole("registrar");
      } else if (isApprover) {
        setRole("approver");
        const matchedMember = state.panel.find(
          (m) =>
            m.name.toLowerCase().includes(username) ||
            m.id.toLowerCase().includes(username) ||
            username.includes(m.id.toLowerCase()) ||
            (fullName && (m.name.toLowerCase().includes(fullName) || fullName.includes(m.name.toLowerCase()) || normalizePersonName(m.name) === normalizePersonName(fullName)))
        );
        if (matchedMember) {
          setApproverId(matchedMember.id);
        }
      } else {
        setRole("student");
        const matched = state.students.find(
          (s) =>
            s.id.toLowerCase() === username ||
            s.name.toLowerCase().includes(username) ||
            username.includes(s.id.toLowerCase()) ||
            (fullName && (s.name.toLowerCase().includes(fullName) || fullName.includes(s.name.toLowerCase()) || normalizePersonName(s.name) === normalizePersonName(fullName))) ||
            (givenName && s.name.toLowerCase().includes(givenName))
        );
        if (matched) {
          setStudentId(matched.id);
        }
      }
    }
  }, [authenticated]);

  const authenticatedUser = useMemo(() => {
    if (!authenticated) return null;
    return {
      id: getValueFromToken("sub") || getValueFromToken("preferred_username") || "tidecloak-user",
      name: (getValueFromToken("name") || getValueFromToken("preferred_username") || "TideCloak User").trim(),
      title: role === "registrar" ? "Registrar" : role === "approver" ? "Approver" : "Student",
    };
  }, [authenticated, role]);

  const activeApprover = state.panel.find((member) => member.id === approverId) ?? state.panel[0];
  const actor = authenticated && authenticatedUser
    ? authenticatedUser
    : role === "registrar"
      ? demoRegistrar
      : role === "approver"
        ? activeApprover
        : state.students.find((student) => student.id === studentId) ?? demoRegistrar;

  const isAlreadyEnrolled = (course, id) => course.enrolled.includes(id);

  const ownWaitlists = useMemo(() => state.courses
    .map((course) => ({ course, position: course.waitlist.indexOf(studentId) + 1 }))
    .filter((item) => item.position > 0), [state.courses, studentId]);

  function submitRequest(event) {
    event.preventDefault();
    const base = {
      kind: requestKind,
      requester: actor.name,
      requesterId: actor.id,
      approverId: role === "approver" ? activeApprover?.id : undefined,
      approverName: role === "approver" ? activeApprover?.name : undefined,
      reason: reason.trim(),
    };
    if (!base.reason) return;
    if (requestKind === "panel") {
      const candidateStudent = state.students.find((student) => student.id === panelCandidate);
      const candidate = panelCandidate === demoRegistrar.id
        ? { id: demoRegistrar.id, name: demoRegistrar.name, title: demoRegistrar.title }
        : candidateStudent
          ? { id: candidateStudent.id, name: candidateStudent.name, title: candidateStudent.title || "Student Representative" }
          : null;
      const replaceMember = state.panel.find((member) => member.id === panelRemoval);
      if (!candidate || !replaceMember) return;
      if (candidate.id === replaceMember.id) {
        setNotice("Cannot replace a panel member with themselves.");
        return;
      }
      dispatch({ type: "request", request: { ...base, candidate, replaceMember } });
    } else {
      dispatch({ type: "request", request: { ...base, courseId: selectedCourse, studentId: targetStudent } });
    }
    setNotice("Request added to the public log. This demo's approval flow is simulated.");
  }

  function attemptRegistrarOverrides() {
    const actorName = actor?.name || demoRegistrar.name;
    dispatch({ type: "blocked", actor: actorName, reason: "Registrar cannot reorder a queue; positions change only through FIFO enrolment or a publicly reasoned, two-approval exception." });
    dispatch({ type: "blocked", actor: actorName, reason: "Registrar cannot change the approver panel alone; a panel change needs two approver votes." });
    setNotice("Both override attempts were blocked. The public log records each attempt.");
  }

  function joinCourse(course) {
    dispatch({ type: "enrol", courseId: course.id, studentId, studentName: personName(state, studentId), actor: actor.name });
    setNotice("Enrolment or FIFO waitlist position recorded in this demo.");
  }

  async function startLogin() {
    try {
      await login();
    } catch (error) {
      setNotice(`TideCloak login could not start: ${error instanceof Error ? error.message : String(error)}. Check that TideCloak is running at localhost:8080.`);
    }
  }

  function handleBatchFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result || "");
        const parsedCourses = parseCoursesFile(text, file.name);
        dispatch({
          type: "batch_upload",
          courses: parsedCourses,
          fileName: file.name,
          actor: actor.name,
        });
        setBatchNotice({
          type: "success",
          message: `Successfully processed "${file.name}": merged ${parsedCourses.length} course(s) into active catalog.`,
        });
      } catch (err) {
        setBatchNotice({
          type: "error",
          message: `Failed to process file: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    };
    reader.onerror = () => {
      setBatchNotice({
        type: "error",
        message: "Failed to read the selected file.",
      });
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function loadSampleBatch() {
    const sampleCsv = `code,name,capacity
COSC2801,Advanced Cloud Architectures,4
COSC2802,Decentralized Governance & Cryptography,3
COMP3100,Applied Artificial Intelligence,5`;
    try {
      const parsedCourses = parseCoursesFile(sampleCsv, "sample_courses.csv");
      dispatch({
        type: "batch_upload",
        courses: parsedCourses,
        fileName: "sample_courses.csv",
        actor: actor.name,
      });
      setBatchNotice({
        type: "success",
        message: `Successfully loaded sample batch: merged 3 courses into catalog and recalculated FIFO waitlists.`,
      });
    } catch (err) {
      setBatchNotice({
        type: "error",
        message: err.message,
      });
    }
  }

  const tokenName = authenticated
    ? getValueFromToken("name") ||
      (getValueFromToken("given_name")
        ? `${getValueFromToken("given_name")} ${getValueFromToken("family_name") || ""}`.trim()
        : null) ||
      getValueFromToken("preferred_username") ||
      "Admin User"
    : "";

  const userRoles = useMemo(() => {
    if (!authenticated) return [];
    const realmAccess = getValueFromToken("realm_access");
    const roles = realmAccess && Array.isArray(realmAccess.roles) ? realmAccess.roles : [];
    const resourceAccess = getValueFromToken("resource_access");
    const clientRoles = (resourceAccess && resourceAccess["fairenrol-app"] && Array.isArray(resourceAccess["fairenrol-app"].roles))
      ? resourceAccess["fairenrol-app"].roles
      : [];
    return [...roles, ...clientRoles];
  }, [authenticated, getValueFromToken]);

  const hasRegistrarRole = authenticated && (
    (typeof hasRealmRole === "function" && (hasRealmRole("registrar") || hasRealmRole("admin"))) ||
    userRoles.includes("registrar") ||
    userRoles.includes("admin")
  );
  const hasApproverRole = authenticated && (
    (typeof hasRealmRole === "function" && hasRealmRole("approver")) ||
    userRoles.includes("approver")
  );

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">F</span> FairEnrol</a>
        <div className="top-actions">
          <span className={`auth-state ${authenticated ? "connected" : ""}`}>
            <i /> {isInitializing ? "TideCloak · connecting..." : authenticated ? `TideCloak · ${tokenName || "signed in"}` : "TideCloak · not signed in"}
          </span>
          {authenticated
            ? <button className="button quiet" onClick={logout}>Log out</button>
            : <button className="button dark" onClick={startLogin} disabled={isLoading || isInitializing}>{isLoading ? "Starting login…" : isInitializing ? "Connecting…" : "Log in with TideCloak"}</button>}
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow"><span /> COURSE REGISTRATION, WITHOUT FAVOURS</div>
          <h1>A fair place<br />in every queue.</h1>
          <p>First come, first served. Exceptions are public, reasoned, and require collective approval.</p>
        </div>
        <div className="hero-card">
          <span className="card-kicker">THE PROMISE</span>
          <strong>No single person<br />can move the line.</strong>
          <div className="avatar-stack">{state.panel.map((member, index) => <span key={member.id} className={`avatar a${index}`}>{member.name.split(" ").map((part) => part[0]).slice(-2).join("")}</span>)}</div>
          <small>Approver panel · 2 of 3 required</small>
        </div>
      </section>

      <div className="demo-warning">
        <span>DEMO MODE</span>
        TideCloak login is real when configured. The role switcher and 2-of-3 exception flow below are local simulations, not Tide-enforced authorization.
      </div>

      <section className="toolbar">
        <div>
          <label htmlFor="role">VIEW AS</label>
          <select id="role" value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="student">Student</option>
            <option value="registrar">Registrar</option>
            <option value="approver">Approver</option>
          </select>
          {role === "student" && <select aria-label="Demo student" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
            {state.students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
          </select>}
          {role === "approver" && <select aria-label="Demo approver" value={activeApprover?.id ?? ""} onChange={(event) => setApproverId(event.target.value)}>
            {state.panel.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.title}</option>)}
          </select>}
        </div>
        <div className="role-hint">
          {authenticated
            ? `Tide roles: ${hasRegistrarRole ? "registrar " : ""}${hasApproverRole ? "approver" : ""}${!hasRegistrarRole && !hasApproverRole ? "student / no admin role" : ""}`
            : "Sign in to view your TideCloak identity and realm roles."}
        </div>
      </section>

      {notice && <div className="notice" role="status">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice("")}>×</button></div>}

      {role === "student" && (
        <section className="section">
          <div className="section-heading"><div><div className="eyebrow">STUDENT DASHBOARD</div><h2>Your courses</h2></div><span className="count-pill">{state.courses.length} open courses</span></div>
          {ownWaitlists.length > 0 && <div className="position-card"><strong>Your waitlist positions</strong>{ownWaitlists.map(({ course, position }) => <span key={course.id}>{course.code} <b>#{position}</b></span>)}</div>}
          <div className="course-grid">
            {state.courses.map((course) => {
              const already = isAlreadyEnrolled(course, studentId);
              const position = course.waitlist.indexOf(studentId) + 1;
              const available = Math.max(0, course.capacity - course.enrolled.length);
              return <article className="course-card" key={course.id}>
                <div className="course-top"><span className="course-code">{course.code}</span><span className={available ? "seats open" : "seats full"}>{available ? `${available} seats open` : "At capacity"}</span></div>
                <h3>{course.name}</h3>
                <div className="course-stats"><span>Enrolled <b>{course.enrolled.length}/{course.capacity}</b></span><span>Waiting <b>{course.waitlist.length}</b></span></div>
                {position > 0
                  ? <div className="queue-status">You’re #{position} in the waitlist <small>Order is first come, first served.</small></div>
                  : already
                    ? <div className="queue-status enrolled">You’re enrolled <small>Your place is confirmed.</small></div>
                    : <button className="button dark full-width" onClick={() => joinCourse(course)}>{available ? "Enrol in course" : "Join waitlist"}</button>}
              </article>;
            })}
          </div>
          <div className="section-heading subheading"><div><div className="eyebrow">PUBLIC EXCEPTIONS</div><h2>Reasons that changed a queue</h2></div></div>
          <div className="reason-list">
            {state.requests.filter((request) => request.status === "approved").map((request) => <div className="reason-item" key={request.id}><span className="approved-tag">APPROVED</span><div><strong>{actionNames[request.kind]}</strong><p>{request.reason}</p></div></div>)}
            {!state.requests.some((request) => request.status === "approved") && <p className="empty">No exceptions approved. The original queue remains unchanged.</p>}
          </div>
        </section>
      )}

      {role === "registrar" && (
        <section className="section">
          <div className="section-heading"><div><div className="eyebrow">REGISTRAR DASHBOARD</div><h2>Course administration</h2></div><span className="count-pill">Course limits only</span></div>

          <div className="batch-upload-card">
            <div className="batch-upload-header">
              <div>
                <span className="eyebrow">BATCH CATALOG MANAGEMENT</span>
                <h3>Upload Courses & Class Capacities</h3>
                <p>Import course lists via JSON or CSV file to update capacities and merge new offerings in real time.</p>
              </div>
              <div className="upload-controls">
                <label className="button dark file-upload-btn" title="Upload courses from JSON or CSV file">
                  <span>📁 Select JSON / CSV File</span>
                  <input
                    type="file"
                    accept=".json,.csv,application/json,text/csv"
                    onChange={handleBatchFileChange}
                    style={{ display: "none" }}
                  />
                </label>
                <button
                  type="button"
                  className="button outline"
                  onClick={loadSampleBatch}
                  title="Load sample batch to test real-time catalog merge"
                >
                  Load Sample Batch
                </button>
              </div>
            </div>
            {batchNotice && (
              <div className={`batch-status-msg ${batchNotice.type === "error" ? "error" : ""}`}>
                <span>{batchNotice.message}</span>
                <button
                  type="button"
                  aria-label="Dismiss batch message"
                  className="batch-dismiss-btn"
                  onClick={() => setBatchNotice(null)}
                >
                  ×
                </button>
              </div>
            )}
          </div>

          <div className="registrar-grid">
            {state.courses.map((course) => {
              const available = Math.max(0, course.capacity - course.enrolled.length);
              return (
                <article className="course-card" key={course.id}>
                  <div className="course-top">
                    <span className="course-code">{course.code}</span>
                    <span className={available ? "seats open" : "seats full"}>
                      {available ? `${available} seats open` : "At capacity"}
                    </span>
                  </div>
                  <h3>{course.name}</h3>
                  <CapacityEditor course={course} actor={actor.name} dispatch={dispatch} />
                  <div className="course-stats">
                    <span>Enrolled <b>{course.enrolled.length}/{course.capacity}</b></span>
                    <span>Waitlist <b>{course.waitlist.length}</b></span>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="blocked-card"><div><span className="blocked-icon">⛔</span><div><strong>Override attempt demo</strong><p>Try moving a friend to the front or adding yourself to the approver panel.</p></div></div><button className="button outline" onClick={attemptRegistrarOverrides}>Attempt both overrides</button></div>
          <RequestForm {...{ state, selectedCourse, setSelectedCourse, requestKind, setRequestKind, targetStudent, setTargetStudent, reason, setReason, panelCandidate, setPanelCandidate, panelRemoval, setPanelRemoval, submitRequest }} registrar />
        </section>
      )}

      {role === "approver" && (
        <section className="section">
          <div className="section-heading"><div><div className="eyebrow">APPROVER PANEL</div><h2>Review exception requests</h2></div><span className="count-pill">{state.panel.length} panel members</span></div>
          <div className="panel-strip">{state.panel.map((member) => <div className="panel-person" key={member.id}><span className="avatar">{member.name.split(" ").map((part) => part[0]).slice(-2).join("")}</span><span><strong>{member.name}</strong><small>{member.title}</small></span></div>)}</div>
          <RequestForm {...{ state, selectedCourse, setSelectedCourse, requestKind, setRequestKind, targetStudent, setTargetStudent, reason, setReason, panelCandidate, setPanelCandidate, panelRemoval, setPanelRemoval, submitRequest }} />
          <div className="request-list">
            {state.requests.map((request) => <article className="request-card" key={request.id}>
              <div className="request-head"><div><span className="eyebrow">{actionNames[request.kind]}</span><h3>{request.kind === "panel" ? `Replace ${request.replaceMember.name} with ${request.candidate.name}` : `${request.kind === "force" ? "Enrol" : request.kind === "jump" ? "Move up" : "Remove"} ${personName(state, request.studentId)} · ${state.courses.find((course) => course.id === request.courseId)?.code}`}</h3></div><span className={`status-tag ${request.status}`}>{request.status}</span></div>
              <p className="request-reason">“{request.reason}”</p>
              <div className="vote-row"><span>{request.approvals.length} of 2 approvals</span><div className="vote-avatars">{request.approvals.map((member) => <span className="avatar mini" title={member.name} key={member.id}>{member.name.split(" ").map((part) => part[0]).slice(-2).join("")}</span>)}</div></div>
              {request.status === "pending" && <div className="request-actions">
                {isSelfRequest(request, activeApprover, actor)
                  ? <span className="muted">Requester cannot approve their own request</span>
                  : <button className="button approve" onClick={() => dispatch({ type: "vote", requestId: request.id, approver: activeApprover, actorName: actor?.name, actorId: actor?.id })} disabled={request.approvals.some((member) => member.id === activeApprover?.id)}>Approve as {activeApprover?.name}</button>}
                <button className="button text-button" onClick={() => dispatch({ type: "deny", requestId: request.id, actor: activeApprover?.name || actor?.name, reason: "The panel declined this request." })}>Deny</button>
              </div>}
            </article>)}
            {state.requests.length === 0 && <p className="empty">No open requests. Submit one above to begin the demo.</p>}
          </div>
        </section>
      )}

      <section className="section explainer">
        <div className="section-heading"><div><div className="eyebrow">WHY GOVERNANCE MATTERS</div><h2>Ordinary roles vs. collective control</h2></div></div>
        <div className="compare-grid">
          <article className="compare-card ordinary"><span>ORDINARY LOGIN + BACKEND ROLES</span><h3>The registrar could</h3><ul><li>Change queue order with an admin API call</li><li>Force-enrol a friend without a public reason</li><li>Add themselves as the only approver</li></ul><p>One trusted backend role is a single point of power.</p></article>
          <article className="compare-card tide"><span>TIDECLOAK + FAIR POLICY</span><h3>The demo blocks this</h3><ul><li>Queue position is assigned in FIFO order</li><li>Exceptions show their reason in the public log</li><li>Two different panel members must approve</li></ul><p>Real TideCloak login is wired; business-action quorum below is simulated and needs a Tide policy integration.</p></article>
        </div>
      </section>

      <section className="section audit-section">
        <div className="section-heading"><div><div className="eyebrow">TRANSPARENT BY DEFAULT</div><h2>Public audit log</h2></div><span className="count-pill">{state.audit.length} events</span></div>
        <div className="audit-list">
          {state.audit.map((entry) => <div className="audit-row" key={entry.id}><time>{new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><span className="audit-dot" /><div><strong>{entry.action}</strong><p>{entry.reason}</p></div><span className="audit-actor">{entry.actor}</span></div>)}
          {state.audit.length === 0 && <p className="empty">Actions, approvals, denials and blocked attempts will appear here.</p>}
        </div>
      </section>

      <footer><span>FairEnrol · Synthetic data only</span><span>Demo build · no university systems connected</span></footer>
    </main>
  );
}

function RequestForm(props) {
  const { state, selectedCourse, setSelectedCourse, requestKind, setRequestKind, targetStudent, setTargetStudent, reason, setReason, panelCandidate, setPanelCandidate, panelRemoval, setPanelRemoval, submitRequest, registrar = false } = props;
  const candidates = [...state.students.filter((student) => !state.panel.some((member) => member.id === student.id))
    .slice(0, 5).map((student) => ({ ...student, title: "Student representative" })), demoRegistrar];

  return <form className="request-form" onSubmit={submitRequest}>
    <div className="form-title"><div><div className="eyebrow">{registrar ? "REQUEST AN EXCEPTION" : "NEW PROTECTED REQUEST"}</div><h3>Ask the panel to review</h3></div><span className="approval-badge">2 of 3 required</span></div>
    <div className="form-grid">
      <label>Action<select value={requestKind} onChange={(event) => setRequestKind(event.target.value)}>{Object.entries(actionNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {requestKind !== "panel" && <>
        <label>Course<select value={selectedCourse} onChange={(event) => setSelectedCourse(event.target.value)}>{state.courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}</select></label>
        <label>Student<select value={targetStudent} onChange={(event) => setTargetStudent(event.target.value)}>{state.students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>
      </>}
      {requestKind === "panel" && <>
        <label>Replace panel member<select value={panelRemoval} onChange={(event) => setPanelRemoval(event.target.value)}>{state.panel.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <label>With new member<select value={panelCandidate} onChange={(event) => setPanelCandidate(event.target.value)}>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
      </>}
      <label className="reason-field">Public reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={240} placeholder="State the reason; this will be public." /></label>
    </div>
    <div className="form-footer"><span>Requester cannot approve their own request.</span><button className="button dark" type="submit">Submit public request</button></div>
  </form>;
}

function CapacityEditor({ course, actor, dispatch }) {
  const [capacity, setCapacity] = useState(String(course.capacity));
  useEffect(() => setCapacity(String(course.capacity)), [course.capacity]);

  function save(event) {
    if (event) event.preventDefault();
    const val = Math.max(1, parseInt(capacity, 10) || 1);
    setCapacity(String(val));
    if (val !== course.capacity) {
      dispatch({ type: "capacity", courseId: course.id, capacity: val, actor });
    }
  }

  function adjustBy(delta) {
    const currentVal = parseInt(capacity, 10) || course.capacity;
    const nextVal = Math.max(1, currentVal + delta);
    setCapacity(String(nextVal));
    if (nextVal !== course.capacity) {
      dispatch({ type: "capacity", courseId: course.id, capacity: nextVal, actor });
    }
  }

  return (
    <form className="capacity-label" onSubmit={save}>
      <label htmlFor={`capacity-${course.id}`}>Seat limit</label>
      <div className="capacity-input-group">
        <button
          type="button"
          className="stepper-btn"
          onClick={() => adjustBy(-1)}
          disabled={course.capacity <= 1 || (parseInt(capacity, 10) || course.capacity) <= 1}
          aria-label="Decrease seat limit"
        >
          −
        </button>
        <input
          id={`capacity-${course.id}`}
          type="number"
          min="1"
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          onBlur={save}
        />
        <button
          type="button"
          className="stepper-btn"
          onClick={() => adjustBy(1)}
          aria-label="Increase seat limit"
        >
          +
        </button>
        <button className="button quiet" type="submit">Save</button>
      </div>
    </form>
  );
}
