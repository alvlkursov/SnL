# WakeOrDonate

## Overview

Мобильное приложение-будильник с механикой принудительного пожертвования. Если не встать вовремя или нажать «отложить» — автоматически списывается выбранная сумма в пользу выбранного благотворительного фонда.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Mobile**: Expo (React Native) with Expo Router
- **Auth**: Token-based auth — scrypt password hashes (legacy SHA256 hashes upgraded on login), random bearer tokens stored hashed in `sessions` table (90-day expiry)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── wake-or-donate/     # Expo mobile app
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Features

### Mobile App (Expo)
- **Auth**: Registration/login with persistent token storage (AsyncStorage)
- **Alarms**: Create, edit, toggle, delete alarms
- **Confirmation methods** (user chooses per alarm):
  - Button: just tap "I'm Awake"
  - Math: solve arithmetic problem
  - Shake: shake the phone
  - QR: scan a QR code (sticker away from bed)
- **Snooze**: optional, each snooze triggers a donation
- **Fund categories**:
  - Favorite: charities you love (from partner list)
  - Recommended: hot charities (company boosts donation)
  - Hated: organizations you dislike (max motivation)
- **Stats**: donation history, success rate, total donated
- **Profile**: user info, fund category explanations, logout

### API Server (Express)
Routes:
- `POST /api/auth/register` — registration
- `POST /api/auth/login` — login
- `GET /api/auth/me` — current user
- `POST /api/auth/logout` — logout
- `GET /api/alarms` — list user alarms
- `POST /api/alarms` — create alarm
- `PUT /api/alarms/:id` — update alarm
- `DELETE /api/alarms/:id` — delete alarm
- `POST /api/alarms/:id/dismiss` — confirm wakeup (no donation)
- `POST /api/alarms/:id/snooze` — snooze (triggers donation, max 3 per ring)
- `GET /api/alarms/events/missed` — unacknowledged missed alarms; `POST /api/alarms/events/:id/ack`
- `PATCH /api/auth/me` — update name / timezone
- `POST /api/donations` — voluntary donation
- `DELETE /api/auth/me` — delete own account (password required); `POST /api/auth/delete-account` — same from the web page
- `GET /api/privacy`, `GET /api/delete-account` — public privacy policy and account-deletion pages (publisher details in `src/lib/legal.ts`)
- `GET /api/charities` — list charities (with ?category= filter)
- `GET /api/donations` — donation history
- `GET /api/donations/stats` — statistics

## Database Schema

- `users` — users with stats
- `charities` — partner charities (recommended/hated, seeded on start)
- `alarms` — user alarms with full configuration
- `donations` — donation history per snooze/miss event
- `sessions` — login sessions (sha256 of token, expiry)
- `alarm_events` — one row per alarm ring (ringing / dismissed / missed, snoozes used)

## Color Palette

- Background: `#0A0A0F` (deep dark)
- Surface: `#141420`
- Card: `#1C1C2E`
- Accent: `#FF5A3C` (orange-red)
- Success: `#30D158` (green)
- Warning/Snooze: `#FF9F0A` (orange)
- Danger: `#FF453A` (red)

## Notes

- **Billing** (`artifacts/api-server/src/lib/billing.ts`, rules in `src/lib/rules.ts`): snoozes, misses and voluntary donations are owed on the month's bill; on the 1st (or once $50 is owed) the card is charged once: donations + fee of 10%, minimum $1. Failed charges retry after 1/3/7 days and block new stakes (HTTP 402) until paid. A billing scheduler runs hourly inside the API process.
- **Piggy bank**: alarms with category `piggy` park money there; it can be donated anytime, taken back 90–120 days after it's paid, then we donate it ("Our choice" payout).
- **Payouts**: `/api/admin` (Basic auth with the `ADMIN_PASSWORD` secret) prepares one payout per charity, takes the charity's receipt link and marks it sent; `/api/transparency` lists all sent payouts publicly.
- **Payment processors** are pluggable (`src/lib/payments/`); `PAYMENTS_PROVIDER` defaults to `test`, which only accepts test cards (4242 4242 4242 4242 works, …0341 declines charges, …0002 fails the $1 check). A real provider (Rapyd / Cardcom / Grow) collects cards on its hosted page and plugs in there.
- Donation amounts are tracked in the DB and displayed in stats
- Currency: USD (`$`) everywhere
- After pulling schema changes run `pnpm --filter @workspace/db run push` to create new tables (e.g. `sessions`)
- Android alarms use a local native module `artifacts/wake-or-donate/modules/alarm-clock` (Kotlin): `AlarmManager.setAlarmClock` (exact, works in Doze), a full-screen-intent notification on the alarm audio stream that loops (`FLAG_INSISTENT`) for up to 10 min, and a deep link `wake-or-donate://alarm/active?id=N` that opens the ring screen over the lock screen. The schedule (next 7 days + snoozes) is pushed from JS (`lib/alarmNotifications.ts`) on every app open and restored after reboot by `BootReceiver`. iOS/web fall back to expo-notifications bursts. Requires a native build (EAS), not Expo Go.
- `app/alarm-setup.tsx` walks the user through Android permissions (notifications, exact alarms, full-screen, battery, Xiaomi autostart / lock-screen pop-ups).
- Server tracks each ring in `alarm_events` (`src/lib/events.ts`): a background scheduler (every 30s) opens occurrences and charges a miss (2× amount) 10 min + 5 min grace after the last ring. Max 3 snoozes per occurrence. Rules live in `src/lib/rules.ts`.
- The scheduler runs inside the API process, so the deployment must stay running (Reserved VM, not Autoscale).
- "Test Alarm" outside a real ring time runs in test mode: nothing is charged.
- Standalone builds read the API base URL from `EXPO_PUBLIC_API_URL` (set per profile in `eas.json`).
