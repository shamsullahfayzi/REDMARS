# CRM Module 7 — Appointment integration

## Design

Reuse the clinical Appointment record, practitioner/department membership,
patient master, caller verification, CRM relationships and transactional audit.
CRM appointment access requires a current scheduling-authorized relationship;
it never grants the agent general access to the appointment book or clinical notes.
Bookings require an existing registered patient. New patient registration and
lead conversion remain Module 8.

Expose the authoritative appointment status directly, including changes made
by reception. Do not maintain a separate CRM status copy. Link CRM-created
appointments to their source relationship and optional lead for attribution.
Cancellation remains a guarded operation on the same appointment.

Add overlap protection to the clinical appointment owner and test concurrent
bookings, cancellation versus check-in, caller verification expiry, cross-facility
references, duplicate commands and minimal response fields. Preserve historical
date-only bookings. Staff select a start time and duration (5–240 minutes), in
Asia/Kabul time. Provider and patient overlaps are rejected, including concurrent
requests. A date-only booking requires review before adding a timed booking for
that provider or patient on the same day. Confirm working hours manually: the
existing ERP has no provider opening-hours calendar.

## Release gate

Use the isolated test database for fixtures and migration verification. Back up
the local main database before applying an additive migration. Test the upgrade
on a restored copy. Rollback first disables CRM and restores the previous app;
preserve appointments and attribution, with no destructive down migration.

## Delivered — 2026-10-18

CRM has an Appointments tab with authorized patient selection, provider reservations,
booking and confirmed cancellation. Contact and lead pages link into booking.
Reception and CRM read the same appointment status. Existing date-only bookings
are preserved. Agents require current caller verification and scheduling authority;
responses omit clinical notes and other patients' identities.

Validation: 232 API integration tests, 41 shared tests and 7 unit tests passed
(280 total), including concurrent booking, cancellation/check-in races, access
expiry and facility isolation. API/shared/web builds and targeted lint passed;
web lint retains its existing Fast Refresh warning. Browser booking and cancellation
passed against a synthetic facility in the isolated test database; cancellation
released the reservation.

The main database backup `.test-runtime/redmars-before-crm7-20261018.dump` was
restored into a disposable database and the upgrade passed before deployment.
Migration `20261018090000_crm_appointments` is applied locally (44 migrations).
Hospital UAT remains separate. Module 8 is not included.
