[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

# FairEnrol — Decentralized Course Enrolment & Quorum Governance

> **RMIT GenAI & Cybersecurity Hackathon 2026 — Challenge 2 (Unlocked Challenge)**  
> **Group Name:** `GDU_SGS_GOAT_C2`  
> **Built with:** [TideCloak](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked) (Decentralized Identity & Access Management)

---

## Project Overview

**FairEnrol** is a decentralized, breach-resilient academic course enrolment and exception management platform where waitlist positions are mathematically guaranteed by first-come, first-served (FIFO) logic, and all administrative overrides strictly require **quorum-enforced governance (2-of-3 threshold approval)** backed by TideCloak decentralized authority.

---

### 1. Vision & Originality

In higher education, high-demand elective courses, capstone units, and scholarship-tied seats regularly fill within seconds of registration opening. In traditional University Management Systems (UMS), course waitlists and seat caps are stored in centralized relational databases operated by a handful of system administrators or registrars.

**FairEnrol introduces a paradigm shift:**
* **No Single God-Mode Admin:** Eliminates the single point of failure where a single registrar or database administrator can secretly force-enrol friends, jump queue priority, or manipulate student positions without oversight.
* **Collective Quorum Authorization:** Administrative exceptions (e.g. medical accessibility accommodations, pre-requisite waivers) cannot be granted unilaterally. They strictly demand a multi-party **2-of-3 threshold consensus** among distinct university stakeholders (Head of School, Academic Advisor, and Student Representative).
* **Transparent Public Audit Ledger:** Every state mutation—enrolments, limit updates, exception requests, individual approval votes, and blocked privilege escalation attempts—is cryptographically attributed and published to an open, auditable log.

---

### 2. Trust Constraint Insight

* **The Problem Today:** Trust in university administration is fragile because it relies on perimeter security and implicit trust in internal operator roles. If an administrative credential is leaked, phishing-compromised, or abused internally, the attacker gains omnipotent access to alter records undetected.
* **What Removal Enables:** When authority is decoupled from centralized master keys and distributed across a decentralized threshold fabric, **trust becomes intrinsic to the system architecture**. Students don't need to "hope" the queue is fair; the platform mathematically guarantees that queue positions cannot be moved without collective, public justification.

---

### 3. Value & Impact

* **For Students:**
  * Complete transparency into their exact waitlist rank (`#1`, `#2`, `#3`) without fear of queue-jumping.
  * Assurance of equal access and zero backroom favoritism.
* **For Faculty & Advisors:**
  * Distributed liability: No single administrator faces external pressure or bribery to grant unfair overrides.
  * Smooth collaboration: Approval workflows are asynchronous, reasoned, and transparent.
* **For Universities & Regulators:**
  * Turnkey compliance with academic integrity guidelines, zero-trust architectures, and anti-corruption standards.
  * Audit-readiness: Every exception has an immutable trail with multi-signature verification.

---

### 4. Why TideCloak Matters

Traditional IAM solutions (OAuth2/OIDC servers, centralized Keycloak) store master private signing keys and superuser privileges in a centralized database. If the server is breached, the attacker can forge JWT tokens or grant themselves administrative roles.

**How TideCloak Solves This:**
1. **Ineffable Cryptography & Threshold Authority:** TideCloak splits cryptographic keys and authority across the decentralized Tide Cybersecurity Fabric. No single node, cloud vendor, or administrator holds the complete private key.
2. **Quorum-Enforced Policy Boundaries:** Critical actions require threshold verification rather than single-operator execution. Even if a registrar's user account is compromised, the attacker cannot unilaterally force an enrolment because authority dynamically emerges only upon 2-of-3 quorum consensus.
3. **Drop-in Keycloak Compatibility:** Built on Keycloak standards, TideCloak seamlessly integrates with modern frontend frameworks using `@tidecloak/react` and standard OIDC tokens (`token_type`, `realm_access`, claims).

---

### 5. Prototype & Storytelling

Our prototype demonstrates the end-to-end user journey across all three ecosystem personas:

1. **Student Journey (Avery Chen / Jordan Patel):**
   * Browse available courses (`COMP3100`, `ISYS3414`, `COSC2408`).
   * One-click enrolment when seats are open, or automatic FIFO waitlist queueing when at capacity.
   * View live rank in the waitlist and review published reasons for approved exceptions.
2. **Registrar Journey (Taylor Reed):**
   * Adjust course capacities interactively with instant real-time FIFO waitlist recalculation and available seat badge updates.
   * **Batch Upload Catalog:** Upload JSON or CSV formatted course/class catalogs to dynamically add and merge offerings in real time.
   * **Privilege Escalation Test:** Click *"Attempt both overrides"* to simulate a rogue administrator trying to jump queue order or unilaterally seize control of the approver panel. The system immediately **intercepts, blocks, and logs** the attempted breach into the public audit ledger.
   * Submit legitimate exception requests with compulsory public justification.
3. **Approver Panel Journey (Dr. Amara Okafor, Sam Williams, Alex Morgan):**
   * Switch between independent panel members.
   * Requesters are blocked from voting on their own requests (anti-self-dealing).
   * Cast independent votes on pending exceptions; upon reaching 2 of 3 approvals, the exception is automatically applied.
4. **TideCloak Authentication:**
   * Full OIDC integration via `@tidecloak/react`. Users can log in directly with their decentralized TideCloak credentials, with automatic view role synchronization based on token claims.

---

## Technical Stack

* **Frontend:** React 19, Vite 6, Modern CSS Design System (DM Sans, Manrope, JetBrains Mono)
* **Identity & Access Management:** `@tidecloak/react` (`^0.14.33`), `@tidecloak/js`
* **Local Backend IAM:** TideCloak Dev Server (`tideorg/tidecloak-dev:latest` on Docker)
* **Demo Video:** `Video.mp4` included in this repository.

---

## Setup & Running Instructions

### 1. Prerequisites
* **Node.js** (v18 or higher)
* **Docker Desktop** (optional, for running live local TideCloak IAM)

### 2. Clone and Install Dependencies
```bash
git clone https://github.com/T-ASTA/rmit-tidecloak-c2.git
cd rmit-tidecloak-c2
npm install
```

### 3. (Optional) Run Local TideCloak Instance
To run the live TideCloak IAM server locally:
```bash
docker run -d \
  -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=password \
  tideorg/tidecloak-dev:latest
```
* Open `http://localhost:8080/` in your browser.
* Create a realm named `fairenrol` and a client named `fairenrol-app`.
* Download or verify `tidecloak.json` in the `/public` folder.

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) to interact with the working app!

*(Note: If the local Docker TideCloak instance is not running, FairEnrol automatically enters high-fidelity interactive demo mode with full simulation of roles, quorum voting, and audit trails).*

### 5. Run Automated Test Suite
```bash
npm test
```
Executes the comprehensive suite of 42 automated tests validating FIFO queue recalculations, dynamic batch catalog ingestion (JSON/CSV), audit log consistency, and 2-of-3 threshold quorum governance.

---

## Repository Structure

```
├── public/
│   ├── silent-check-sso.html    # OIDC silent SSO check
│   ├── sample_courses.csv       # Sample CSV batch catalog
│   ├── sample_courses.json      # Sample JSON batch catalog
│   └── tidecloak.json           # TideCloak client config
├── src/
│   ├── App.jsx                  # Main FairEnrol dashboard & governance state machine
│   ├── courseLogic.js           # Core FIFO, file parsing, and quorum logic
│   ├── main.jsx                 # React root with TideCloakContextProvider
│   ├── seed.json                # Seed courses and students
│   └── style.css                # Polished design system
├── tests/
│   └── fairenrol.test.js        # 42 unit and adversarial integration tests
├── Video.mp4                    # Complete walkthrough video of the working app
├── index.html                   # HTML entry point
├── package.json                 # Dependencies (@tidecloak/react, react 19, vite)
└── README.md                    # Project documentation
```

---

## Submission Details

* **Event:** RMIT GenAI & Cybersecurity Hackathon 2026
* **Challenge:** Challenge 2 — Vibe code a working app with TideCloak
* **Group Name:** `GDU_SGS_GOAT_C2`
* **Repository:** `https://github.com/T-ASTA/rmit-tidecloak-c2`
* **Video:** `Video.mp4` (in root directory)
