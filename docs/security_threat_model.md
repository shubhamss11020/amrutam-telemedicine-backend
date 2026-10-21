# Security Checklist, Threat Model & Compliance Framework

> **System:** Amrutam Telemedicine Backend  
> **Compliance Target:** HIPAA (Health Insurance Portability and Accountability Act), DISHA (Digital Information Security in Healthcare Act), OWASP API Security Top 10

---

## 1. STRIDE Threat Model & Attack Surface Analysis

| Threat Category | Potential Attack Vector | Impact | Our Defense & Mitigation in Code |
|---|---|---|---|
| **S - Spoofing** | Adversary falsifies doctor identity to issue forged prescriptions. | High | Cryptographically signed JWT tokens with short expiry (1h), password hashing using Bcrypt (12 rounds), HMAC-SHA256 digital prescription signatures. |
| **T - Tampering** | Attacker intercepts and modifies consultation symptoms or dosage amounts. | Critical | Field-level AES-256-GCM authenticated encryption (authTag verification throws if modified). TLS 1.3 in transit. |
| **R - Repudiation** | Doctor denies issuing a prescription, or patient claims they did not book. | High | Tamper-evident, immutable `audit_logs` capturing actor ID, timestamp, IP address, user agent, and resource ID for every clinical event. |
| **I - Information Disclosure** | Insecure Direct Object References (IDOR) allowing patient A to view patient B's medical records. | Critical | Strict tenancy guards in `BookingService` and `PrescriptionService` ensuring only assigned doctor or owning patient can access records. |
| **D - Denial of Service** | Botnet floods booking endpoints to exhaust doctor availability slots or crash DB. | High | Sliding-window Rate Limiting (`rateLimiter` middleware), pessimistic row locking preventing DB deadlocks, Redis-backed throttling. |
| **E - Elevation of Privilege** | Normal patient invokes doctor/admin endpoints to modify schedules or view analytics. | Critical | Role-Based Access Control (`requireRole('DOCTOR', 'ADMIN')`) enforced before controller execution. |

---

## 2. OWASP API Security Top 10 Mitigation Matrix

### API1:2023 Broken Object Level Authorization (BOLA / IDOR)
- **Mitigation:** Endpoints such as `GET /api/v1/bookings/:id` and `GET /api/v1/prescriptions/consultation/:id` verify that the authenticated `req.user.userId` strictly matches either `consultation.patientId` or `doctor.userId`. If neither matches, an immediate `403 Forbidden` is returned.

### API2:2023 Broken Authentication
- **Mitigation:** JWT tokens signed with HMAC-SHA256 using secrets $\ge 32$ characters. Separate Refresh Token rotation with strict audience/issuer validation. Dedicated brute-force rate limiter on `/api/v1/auth/login` (max 20 attempts/minute).

### API3:2023 Broken Object Property Level Authorization
- **Mitigation:** Strict input schema validation via Zod DTOs (`createBookingSchema`, `createPrescriptionSchema`). Disallowed properties in request payloads are stripped and rejected.

### API4:2023 Unrestricted Resource Consumption
- **Mitigation:** Global payload size cap (1MB), database query pagination (default 50 records), sliding-window rate limiting, and PostgreSQL connection pool limits (`max: 20`).

### API5:2023 Broken Function Level Authorization
- **Mitigation:** Administrative and clinical endpoints (such as `POST /api/v1/slots`, `POST /api/v1/prescriptions`, `GET /api/v1/analytics/dashboard`) explicitly enforce role checks using the `requireRole('DOCTOR')` and `requireRole('ADMIN')` middleware guards.

### API6:2023 Unrestricted Access to Sensitive Business Flows
- **Mitigation:** Double-booking prevention enforced via atomic row locks (`SELECT FOR UPDATE`), plus non-negotiable `Idempotency-Key` headers on all booking and payment operations.

### API7:2023 Server-Side Request Forgery (SSRF)
- **Mitigation:** Telemedicine backend does not accept arbitrary external URLs from client payloads. All outbound webhooks and payment gateways use fixed, verified endpoints.

### API8:2023 Security Misconfiguration
- **Mitigation:** HTTP security headers applied via `helmet()` (Disables `X-Powered-By`, enables HSTS, X-Content-Type-Options: nosniff). All environment configurations validated via Zod on startup.

### API9:2023 Improper Inventory Management
- **Mitigation:** Interactive OpenAPI 3.0 specification served directly at `/api/docs` with distinct versioned routing (`/api/v1`).

### API10:2023 Unsafe Consumption of APIs
- **Mitigation:** Upstream responses from payment services and external providers are parsed with strict schema validations and wrapped in circuit breakers.

---

## 3. Healthcare Data Classification Matrix

| Classification Level | Data Attributes | Storage Security | Transit Security | Retention Policy |
|---|---|---|---|---|
| **Protected Health Information (PHI)** | Symptoms, Medical History, Diagnosis, Prescribed Medications, Clinical Notes | AES-256-GCM Field-Level Authenticated Encryption | TLS 1.3 / HTTPS Only | 7 Years (Medical Regulatory Standard) |
| **Personally Identifiable Information (PII)** | Patient Full Name, Phone Number, Email, Emergency Contact | Column-level indexing, masked in application logs | TLS 1.3 | Active account lifetime |
| **Financial Data** | Payment Transaction References, Amounts, Currency | Stored without storing raw card/UPI details (PCI-DSS tokenization) | TLS 1.3 | 7 Years (Financial Audit Standard) |
| **Public Data** | Doctor Names, Specialties, Experience, Ratings, Slot Timings | Unencrypted, cached in Redis | TLS 1.3 | Indefinite |

---

## 4. Encryption & Cryptographic Key Management

1. **At-Rest Field-Level Encryption:**
   - Algorithm: **AES-256-GCM** with unique 16-byte random IVs per record and 16-byte authentication tags.
   - Storage format: `hex(iv):hex(authTag):hex(ciphertext)`.
   - Any modification or tampering with encrypted data triggers authentication tag verification failure and throws an exception.
2. **Password Hashing:**
   - Algorithm: **Bcrypt** with salt work factor of 12 (computationally expensive against GPU/ASIC rainbow table attacks).
3. **Key Rotation Protocol:**
   - Envelope Encryption: Data Encryption Keys (DEKs) encrypted by a Key Encryption Key (KEK) managed in cloud KMS (AWS KMS / GCP Cloud KMS / HashiCorp Vault).
   - KEK rotated automatically every 90 days with re-encryption workers performing zero-downtime key version migration.

---

## 5. Security Checklist for Production Deployment

- [x] Strict TypeScript compilation with `noImplicitAny` and strict null checks.
- [x] Passwords securely hashed with Bcrypt (salt factor 12).
- [x] JWT access tokens expire in 1 hour; refresh tokens expire in 7 days.
- [x] Protected Health Information (PHI) encrypted with AES-256-GCM.
- [x] Input sanitization and runtime validation with Zod on 100% of routes.
- [x] Row-level locking on slots preventing double bookings (`SELECT FOR UPDATE`).
- [x] Idempotency keys enforced on all write mutations.
- [x] Helmet security headers configured (HSTS, CSP, XSS protection).
- [x] Rate limiting active on authentication and booking endpoints.
- [x] Tamper-evident healthcare audit logging active.
- [x] Dockerfile runs as a non-privileged `appuser` (non-root).
- [x] Automated CI pipeline scanning for dependencies with `npm audit`.
- [x] Prometheus metrics and liveness/readiness health probes active.
