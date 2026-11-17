# Fingerprint and card readers (HR attendance)

A reader (fingerprint, card, face, or the small program that collects from it) sends clock-ins and clock-outs to the
company's attendance. Nothing about the person's fingerprint or face is ever sent or kept: the reader keeps it and only
sends **a number** (the employee's user id or card number on the reader) and **a time**.

## Set up (owner or HR, website: HR → Attendance; Android: HR → Attendance)

1. **Add the reader** (name and type). The key is shown **once**; only its hash is kept. Lost key: "New key" (the old one stops).
2. **Give each employee their number on the reader** (employee card → "Reader number", or when adding the employee). The
   number is unique per company.
3. Put the key in the reader's settings, or in the program that collects from it.

## Sending punches (the reader or its program)

```
POST https://dalilacom.com/hr/device/punches
X-Device-Key: <the key>
Content-Type: application/json

{ "punches": [ { "code": "17", "at": "2026-03-02 08:03:00", "direction": "IN" } ] }
```

- `code`: the employee's number on the reader. `at`: a time with an offset (`2026-03-02T08:03:00+03:00`, `...Z`), or
  without one, which is read in the **company time zone** (readers print local time). `direction` is optional (`IN` or `OUT`).
- Up to 500 punches per request; the answer lists the result of each one (`CHECKED_IN`, `CHECKED_OUT`, `DUPLICATE`,
  `UNKNOWN_CODE`, `TERMINATED`, `BAD_TIME`, `FUTURE`, `ALREADY_IN`, `NO_OPEN_CHECK_IN`, `OUT_OF_ORDER`). Sending the same
  punch again is safe.
- Without `direction` a punch **toggles**: the first opens the day, the next closes it. Two punches of the same person
  within 60 seconds count as one (a double scan). A time more than 10 minutes in the future is refused.
- `GET /hr/device/ping` with the key checks the key and shows the company time zone and the server time.

## Importing a file (no program needed)

HR → Attendance → "Import attendance from a file": one line each, `code, date time, IN|OUT` (the direction optional;
comma, semicolon or tab; a header line is skipped; up to 2000 lines per file, the web and the app split longer ones).
Records from a file are marked "From a file", and from a reader "From a reader".

## Good to know

- The attendance records are the same ones payroll, the manager view and "my job" use. A manager can still correct any record by hand.
- A switched-off or deleted reader stops being accepted at once. Its old records stay.
- Punches stop being accepted when the owner's HR plan ends (the same rule as clock-in from the app).
