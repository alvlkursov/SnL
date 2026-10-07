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
- `POST /api/alarms/:id/snooze` — snooze (triggers donation)
- `GET /api/charities` — list charities (with ?category= filter)
- `GET /api/donations` — donation history
- `GET /api/donations/stats` — statistics

## Database Schema

- `users` — users with stats
- `charities` — partner charities (recommended/hated, seeded on start)
- `alarms` — user alarms with full configuration
- `donations` — donation history per snooze/miss event
- `sessions` — login sessions (sha256 of token, expiry)

## Color Palette

- Background: `#0A0A0F` (deep dark)
- Surface: `#141420`
- Card: `#1C1C2E`
- Accent: `#FF5A3C` (orange-red)
- Success: `#30D158` (green)
- Warning/Snooze: `#FF9F0A` (orange)
- Danger: `#FF453A` (red)

## Notes

- Payment processing (PayPal/Google Pay/Stripe) is designed as a flow but actual payment API integration requires credentials from the user
- Donation amounts are tracked in the DB and displayed in stats
- Currency: USD (`$`) everywhere
- After pulling schema changes run `pnpm --filter @workspace/db run push` to create new tables (e.g. `sessions`)
- Alarm notification scheduling requires native push notifications (expo-notifications) — the active alarm screen is accessible via "Test Alarm" button in the edit screen for demo purposes
