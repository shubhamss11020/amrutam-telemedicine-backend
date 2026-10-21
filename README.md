# 🌿 Amrutam Telemedicine Backend

[![CI Pipeline](https://github.com/amrutam/telemedicine-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/amrutam/telemedicine-backend/actions)
![Node.js](https://img.shields.io/badge/Node.js-v22%20LTS-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20Mode-blue.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)
![Redis](https://img.shields.io/badge/Redis-7-red.svg)
![License](https://img.shields.io/badge/License-Proprietary-purple.svg)

> Production-grade, highly scalable backend for Amrutam's Telemedicine System. Engineered to handle **100,000 daily consultations**, sub-second p95 latencies (**<200ms reads, <500ms writes**), **99.95% availability**, and strict healthcare compliance (HIPAA/DISHA) with non-negotiable **idempotency** and **concurrency locks**.

---

## 📋 Table of Contents
1. [Architectural Highlights](#-architectural-highlights)
2. [Tech Stack](#-tech-stack)
3. [Quick Start (Local Standalone in 60s)](#-quick-start-local-standalone-in-60s)
4. [Docker Compose Deployment](#-docker-compose-deployment)
5. [Automated Test Suite & Concurrency Verification](#-automated-test-suite--concurrency-verification)
6. [Pre-Seeded Test Credentials](#-pre-seeded-test-credentials)
7. [API Endpoints & Swagger Documentation](#-api-endpoints--swagger-documentation)
8. [Core Architectural Mechanisms](#-core-architectural-mechanisms)
9. [Observability & Health Checks](#-observability--health-checks)
10. [Deliverables Directory](#-deliverables-directory)

---

## 🏛️ Architectural Highlights

* **Clean 4-Layer Architecture with Dependency Injection (DI):** Domain entities, decoupled use cases/services, typed repository contracts, and isolated HTTP controllers.
* **Airtight Concurrency & Zero Double-Booking:** Pessimistic row-level locking (`SELECT ... FOR UPDATE`) in PostgreSQL + atomic mutex locks + optimistic version counters (`version = version + 1`).
* **Non-Negotiable Idempotency Engine:** Standardized `Idempotency-Key` header enforcement on write mutations with atomic distributed state locking and cached response replays.
* **Distributed Booking-Payment Saga:** 3-state orchestration (`RESERVED` $\rightarrow$ `CONFIRMED` or automated compensation rollback releasing slots on payment timeout/failure).
* **HIPAA/DISHA Compliant Security:** Field-level authenticated encryption (**AES-256-GCM**) for Protected Health Information (symptoms, clinical diagnosis), Bcrypt (12 rounds), HMAC-SHA256 digital prescription signatures, and tamper-evident audit logs.
* **Dual Persistence Layer:** High-performance PostgreSQL 16 repository implementation with automatic in-memory fallback for zero-dependency local testing.

---

## 🛠️ Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| **Runtime & Language** | Node.js v22 LTS + TypeScript (Strict Mode) | High async I/O throughput, complete compile-time type safety. |
| **Framework** | Express + Modular Routers | Industry standard, lightweight, decoupled controllers. |
| **Database** | PostgreSQL 16 + Connection Pooling (`pg.Pool`) | ACID transactions, explicit row locking (`SELECT FOR UPDATE`), indexes. |
| **Cache & Distributed Store** | Redis 7 | Cache-aside for doctor search and distributed sliding-window rate limiting. |
| **Validation** | Zod | Runtime schema validation with typed error details. |
| **Security** | Helmet, AES-256-GCM, Bcrypt, JWT | Hardened HTTP headers, field-level PHI encryption, RBAC. |
| **Observability** | Pino + `prom-client` (Prometheus) | Structured JSON logs with Correlation IDs, `/metrics` endpoint. |
| **Testing** | Vitest + Supertest | Blazing fast concurrency stress testing and integration test execution. |
| **Containerization** | Docker (Multi-stage) & Docker Compose | Minimal, non-root alpine image and reproducible local orchestrator. |

---

## ⚡ Quick Start (Local Standalone in 60s)

The project includes an **automatic in-memory repository fallback** with pre-seeded data, allowing you or any evaluator to test the complete application immediately without needing PostgreSQL or Redis pre-installed on the host machine.

### 1. Clone & Install
```bash
git clone <repo-url>
cd Assign
npm install
```

### 2. Environment Setup
The repository comes pre-configured with `.env.example` and `.env`:
```bash
cp .env.example .env
```

### 3. Start Development Server
```bash
npm run dev
```

The server will automatically bootstrap, seed test doctors, slots, and patients, and start on `http://localhost:4000`:
* 📚 **Interactive Swagger UI:** [http://localhost:4000/api/docs](http://localhost:4000/api/docs)
* 📊 **Prometheus Metrics:** [http://localhost:4000/metrics](http://localhost:4000/metrics)
* 🩺 **Health Check:** [http://localhost:4000/health](http://localhost:4000/health)
* 🩺 **Readiness Probe:** [http://localhost:4000/health/ready](http://localhost:4000/health/ready)

---

## 🐳 Docker Compose Deployment

To run the complete production stack (App + PostgreSQL 16 + Redis 7 + Prometheus):

```bash
docker-compose up --build -d
```

### Service Map:
| Service | Internal Port | Host Port | Purpose |
|---|---|---|---|
| `app` | 4000 | `4000` | Amrutam Node.js 22 Backend API |
| `postgres` | 5432 | `5432` | PostgreSQL 16 Primary Database |
| `redis` | 6379 | `6379` | Redis 7 Cache & Rate Limiter |
| `prometheus`| 9090 | `9090` | Prometheus Metrics Collector |

To stop the containers:
```bash
docker-compose down -v
```

---

## 🧪 Automated Test Suite & Concurrency Verification

The test suite includes unit tests, integration tests, and a **high-contention concurrency stress test** simulating simultaneous slot booking attempts.

Run the test suite:
```bash
npm test
```

### Key Tests Included:
1. **`tests/concurrency/slot_race_condition.test.ts`:**
   * Fires 10 concurrent HTTP requests simultaneously attempting to book the EXACT SAME availability slot.
   * **Result:** Exactly 1 request succeeds (HTTP 201 Created), and the other 9 receive clean HTTP 409 Conflict with `SLOT_ALREADY_BOOKED` without race conditions or deadlocks.
2. **`tests/integration/full_telemedicine_lifecycle.test.ts`:**
   * Validates Doctor Registration $\rightarrow$ Slot Publishing $\rightarrow$ Patient Registration $\rightarrow$ Doctor Search $\rightarrow$ Slot Reservation with `Idempotency-Key` $\rightarrow$ Idempotency Replay Cache verification $\rightarrow$ Payment Saga $\rightarrow$ Digital Prescription issuance $\rightarrow$ Decrypted PHI retrieval $\rightarrow$ Health/Metrics verification.
3. **`tests/unit/crypto.test.ts`:**
   * Verifies AES-256-GCM encryption, decryption, authentication tag tampering detection, and Bcrypt hashing.
4. **`tests/unit/idempotency.test.ts`:**
   * Verifies key locking, duplicate conflict rejection, and resolution caching.

---

## 👥 Pre-Seeded Test Credentials

When running in development or standalone mode, the following test accounts are pre-seeded:

| Role | Email | Password | Details |
|---|---|---|---|
| **Admin** | `admin@amrutam.co` | `AdminPass123!` | System administrator with access to `/audit` and `/analytics` |
| **Doctor** | `dr.ananya@amrutam.co` | `DoctorPass123!` | Ayurvedic Medicine & Panchakarma (Fee: ₹800, Rating: 4.9) |
| **Doctor** | `dr.rajesh@amrutam.co` | `DoctorPass123!` | Dermatology & Skin Wellness (Fee: ₹600, Rating: 4.8) |
| **Doctor** | `dr.priya@amrutam.co` | `DoctorPass123!` | General Medicine & Nutrition (Fee: ₹500, Rating: 4.95) |
| **Patient** | `patient1@example.com` | `PatientPass123!` | Patient with encrypted medical history |
| **Patient** | `patient2@example.com` | `PatientPass123!` | Secondary patient |

---

## 📡 API Endpoints & Swagger Documentation

Interactive OpenAPI documentation is available live at **`/api/docs`**.

### Core Routes Summary:

#### 1. Authentication (`/api/v1/auth`)
* `POST /register`: Register patient, doctor, or admin.
* `POST /login`: Authenticate and receive Access + Refresh tokens.
* `POST /refresh`: Rotate refresh token.
* `GET /me`: Current authenticated user profile.
* `POST /mfa/toggle`: Enable/disable MFA.

#### 2. Doctors & Discovery (`/api/v1/doctors`)
* `GET /`: Search doctors with filters (`specialization`, `minRating`, `maxFee`, `search`).
* `GET /:id`: Get detailed doctor profile.

#### 3. Doctor Availability Slots (`/api/v1/slots`)
* `POST /`: Generate slots for a date (Doctors & Admins only).
* `GET /available`: Query open slots for a doctor with date range.

#### 4. Concurrency-Safe Bookings (`/api/v1/bookings`)
* `POST /`: Reserve a slot. **Requires `Idempotency-Key` header**.
* `GET /`: List consultations for current user.
* `GET /:id`: View consultation details (Decrypted PHI, audit logged).
* `PATCH /:id/status`: Doctor updates consultation status (`IN_PROGRESS`, `COMPLETED`, `CANCELLED`).

#### 5. Payments & Saga Orchestration (`/api/v1/payments`)
* `POST /process`: Complete payment capture. Confirms booking saga or rolls back slot if failed. **Requires `Idempotency-Key` header**.
* `GET /consultation/:consultationId`: View payment transaction status.

#### 6. Digital Prescriptions (`/api/v1/prescriptions`)
* `POST /`: Issue digital prescription with AES-256-GCM encrypted diagnosis and HMAC-SHA256 signature (Doctor only). **Requires `Idempotency-Key` header**.
* `GET /consultation/:consultationId`: Patient or doctor reads prescription (Audit logged).

#### 7. Audit & Analytics (Admin Only)
* `GET /api/v1/audit`: Inspect tamper-evident compliance access logs.
* `GET /api/v1/analytics/dashboard`: Consultation volume, revenue, and active doctor metrics.

---

## 🔒 Core Architectural Mechanisms

### 1. Concurrency Locking Mechanism
```sql
-- Atomic Row-Level Reservation
BEGIN;
SELECT id, status, version 
FROM availability_slots 
WHERE id = $slotId 
FOR UPDATE;

-- If status == 'AVAILABLE':
UPDATE availability_slots 
SET status = 'RESERVED', reserved_until = NOW() + INTERVAL '10 minutes', version = version + 1 
WHERE id = $slotId;
COMMIT;
```

### 2. Idempotency Protocol
Every write request requires an `Idempotency-Key: <UUID>`:
1. `IN_PROGRESS` $\rightarrow$ Concurrent identical requests receive `409 Conflict`.
2. `RESOLVED` $\rightarrow$ Directly replays the saved HTTP response body and status code without executing business logic or charging twice.

### 3. Protected Health Information (PHI) Encryption
* Sensitive clinical records (`encrypted_symptoms`, `encrypted_diagnosis`) are encrypted using **AES-256-GCM** before persistence.
* Format: `hex(iv):hex(authTag):hex(ciphertext)`.
* Guarantees confidentiality and tamper-detection.

---

## 📊 Observability & Health Checks

* **Structured Logging (Pino):** All logs are emitted as structured JSON with automatic correlation tracking (`x-request-id`, `userId`, `userRole`, `method`, `path`).
* **Prometheus Metrics (`/metrics`):**
  * `amrutam_http_request_duration_seconds`: Request latency histogram (tuned for p95 <200ms reads, <500ms writes).
  * `amrutam_http_requests_total`: Total HTTP requests counter.
  * `amrutam_slot_booking_attempts_total`: Slot bookings categorized by `SUCCESS` or `CONFLICT_ALREADY_BOOKED`.
  * `amrutam_idempotency_operations_total`: Replays and lock acquisitions.
  * `amrutam_active_consultations`: Gauge of ongoing live consultations.
* **Probes:**
  * `GET /health`: Liveness probe (HTTP 200).
  * `GET /health/ready`: Readiness probe (checks DB pool, memory RSS/heap).

---

## 📁 Deliverables Directory

All required deliverables are located in the repository:
1. **Source Code & Layered Architecture:** [`src/`](file:///c:/Users/shubh/OneDrive/Desktop/Assign/src)
2. **Architecture Whitepaper (2–4 pages):** [`docs/architecture.md`](file:///c:/Users/shubh/OneDrive/Desktop/Assign/docs/architecture.md)
3. **OpenAPI 3.0 YAML Specification:** [`docs/openapi.yaml`](file:///c:/Users/shubh/OneDrive/Desktop/Assign/docs/openapi.yaml)
4. **Security Checklist & STRIDE Threat Model:** [`docs/security_threat_model.md`](file:///c:/Users/shubh/OneDrive/Desktop/Assign/docs/security_threat_model.md)
5. **Database DDL Schema:** [`src/core/database/schema.sql`](file:///c:/Users/shubh/OneDrive/Desktop/Assign/src/core/database/schema.sql)
6. **Docker & Infrastructure as Code:** [`docker/Dockerfile`](file:///c:/Users/shubh/OneDrive/Desktop/Assign/docker/Dockerfile), [`docker-compose.yml`](file:///c:/Users/shubh/OneDrive/Desktop/Assign/docker-compose.yml), [`docker/prometheus.yml`](file:///c:/Users/shubh/OneDrive/Desktop/Assign/docker/prometheus.yml)
7. **Automated CI/CD Pipeline:** [`.github/workflows/ci.yml`](file:///c:/Users/shubh/OneDrive/Desktop/Assign/.github/workflows/ci.yml)
8. **Automated Tests:** [`tests/`](file:///c:/Users/shubh/OneDrive/Desktop/Assign/tests)
