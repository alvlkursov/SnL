# Google Play: Data safety & app content answers

Answers for Play Console → **App content**. They match what the app does today
(no real payments yet). **Update this file and the Play Console form when payments ship.**

## Links

| Field | Value |
|---|---|
| Privacy policy URL | `https://wake-up-donate--sekkka.replit.app/api/privacy` |
| Account deletion URL | `https://wake-up-donate--sekkka.replit.app/api/delete-account` |
| Support email | `al.vl.kursov@gmail.com` |

## Data collection and security

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS only) |
| Do you provide a way for users to request that their data is deleted? | **Yes** — in-app (Profile → Delete Account) and via the web URL above |
| Account creation methods | **Username and password** (email + password) |

## Data types (all: Collected = Yes, Shared = No, Processed ephemerally = No, Required = Yes)

| Category → Type | Purposes |
|---|---|
| Personal info → **Name** | App functionality, Account management |
| Personal info → **Email address** | App functionality, Account management |
| Personal info → **User IDs** | App functionality, Account management |
| Financial info → **Purchase history** (donation records) | App functionality |
| App activity → **Other user-generated content** (alarm settings, labels) | App functionality |
| App activity → **Other actions** (alarm dismissed / snoozed / missed) | App functionality |

Not collected: location, contacts, photos/videos, audio, files, calendar, health/fitness,
messages, web browsing, device or other IDs, crash logs, diagnostics, payment card info (yet).
Motion sensor ("shake to dismiss") is processed on the device only and never sent — not "collected".

## Other App content sections

| Section | Answer |
|---|---|
| Ads | **No**, the app does not contain ads |
| Target audience | **18+** only (app involves money commitments) |
| Content rating questionnaire | Category: Utility/Productivity; no violence, sexual content, gambling, user-to-user communication |
| Financial features | None yet (update when card payments ship) |
| Government app / News app / Health app | No |

## Permissions to declare

| Permission | Why (text for the Play Console declaration) |
|---|---|
| `USE_EXACT_ALARM` / `SCHEDULE_EXACT_ALARM` | The app is an alarm clock; the user's alarms must ring at the exact time they set. |
| `POST_NOTIFICATIONS` | Alarms are delivered as high-priority notifications. |
| `RECEIVE_BOOT_COMPLETED` | Keep scheduled alarms after the phone restarts. |

> Note: Play restricts `USE_EXACT_ALARM` to apps whose core function is an alarm clock or calendar.
> WakeOrDonate qualifies (core function = alarm clock); select "Alarm clock" in the declaration.
