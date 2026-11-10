# Security and data protection

This system holds children's personal data. The controls below are implemented in this repository.

## Authentication
- Passwords are hashed with **Argon2id** (OWASP parameters). Policy: at least 10 characters, with letters and digits.
- **DB-backed sessions**: the cookie holds a random 256-bit token; only its SHA-256 is stored. Cookies are `HttpOnly`, `SameSite=Lax` and `Secure` in production. 7-day absolute lifetime, 12-hour idle timeout.
- **MFA (TOTP)** for privileged roles (president, administrator, accountant) is enforced in production (`MFA_ENFORCE`, plus the academy setting). The TOTP secret is encrypted at rest.
- **Brute-force protection**: Postgres-backed rate limits per IP and per email; the account locks for 15 minutes after 8 failures; failed attempts are audited. A dummy hash makes login timing the same for unknown emails.
- Password changes, deactivation and password-link issuance revoke sessions. Setup and reset links are single-use, hashed and time-limited.

## Authorization
- Permissions are checked server-side on every page, action and API route (`requirePermission`, `authorize`).
- Row-level scoping (`playerScope`, `sessionScope`, branch filters) covers coaches (assigned groups only), parents (linked children only) and branch staff (their branch only). Integration tests cover each case.
- Users can't grant roles at or above their own rank.

## Data protection
- **Medical data, MFA secrets, and injury and incident text are encrypted** with AES-256-GCM (`DATA_ENCRYPTION_KEY`).
- Medical details are revealed on demand, and **each reveal is audited**. Medical content is never written to audit logs or CSV exports.
- **Files** are stored privately (local directory or private bucket) under random keys. File type is checked by magic bytes (JPEG, PNG, WebP, PDF only) with a 5 MB limit. Downloads go through permission checks, and sensitive documents (birth certificates, medical clearances) need medical permission and are audited.
- No child data is reachable through a public URL. The public form only writes; it never reads applications back.
- CSV exports neutralise formula injection.
- Records are soft-deleted (players archived, documents hidden); financial and credit ledgers are append-only.

## Platform hardening
- Security headers on every response: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy and Permissions-Policy.
- Server Actions carry Next.js origin checks (CSRF). The public application form is rate-limited and has a honeypot field.
- Unexpected errors are logged on the server and shown to users as a generic message.

## Nigeria Data Protection Act (NDPA) 2023 considerations
- **Consent**: digital consent records (type, version, typed signature, timestamp, IP) for participation, medical treatment, data processing, photos and video. Optional consents (photo, video) are tracked per player.
- **Purpose limitation and minimisation**: only data needed for football and safety is collected; exports exclude medical data.
- **Access control and accountability**: least-privilege roles, branch isolation, and audit logs of access to sensitive data.
- **Retention**: `dataRetentionMonths` is configurable in Settings. The purge job is scheduled for Phase 6 (see PROGRESS.md).
- **Data subject requests**: export from the player profile or CSV today. A one-click guardian data export is planned for Phase 6.
- Appoint a Data Protection Officer and register with the NDPC as your processing volume requires. That is an organisational step, outside the software.

## Integrations
- Payments go through Paystack in **test mode** until live deployment is explicitly approved. Webhook signature verification and idempotency are modelled (`PaymentWebhookEvent`) for Phase 3.
- WhatsApp will use the **official WhatsApp Business Platform** only. Message delivery is never reported as successful unless a provider confirms it. Without a provider, messages are stored as `NOT_SENT_NO_PROVIDER`.
