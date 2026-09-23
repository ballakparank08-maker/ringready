# RingReady 📞

> Practice high-stakes phone calls out loud with lifelike, real-time AI personas.

![RingReady](apps/web/public/logo.png)

## Overview

**RingReady** is a full-stack call-practice web platform designed to train professionals, intake officers, and citizens through realistic, voiced telephone scenarios. 

- **Realistic Voice Interaction**: Browser Web Speech recognition and text-to-speech voice synthesis.
- **Scenario Training**: Full multi-stage scenarios (e.g., NYPD Identity Theft Intake, Document Leakage SOP).
- **In-Character AI Streaming**: Real-time token-by-token Server-Sent Events (SSE) dialogue with local conversational fallback and optional remote model support.
- **Transcript History**: Full turn-by-turn call persistence with SQLite and PocketBase.
- **Built with**: React Router SSR, TypeScript, Tailwind CSS, PocketBase, and Vite.

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- PocketBase (auto-downloaded or included in `apps/pocketbase`)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ballakparank08-maker/ringready.git
   cd ringready
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment:
   ```bash
   cp apps/web/.env.example apps/web/.env
   ```

4. Start development servers (frontend + PocketBase):
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Default Accounts

| Account | Email | Password | Role |
|---|---|---|---|
| **Demo User** | `demo@ringready.local` | `password123456` | Verified Practice Caller |
| **Officer Daniels** | `officer.daniels@ringready.local` | `password123456` | Verified Intake Officer |
| **Admin Superuser** | `admin@ringready.local` | `admin12345678` | PocketBase Admin (`http://localhost:8090/_/`) |

---

## Project Structure

```
├── apps/
│   ├── pocketbase/         # PocketBase backend (SQLite, migrations, hooks)
│   └── web/                # React Router SSR application
│       ├── public/         # 24K gold branding, icons, logo assets
│       └── src/
│           ├── api/        # Client API SDKs
│           ├── components/ # UI components (CallScreen, AuthForm, layout)
│           ├── data/       # Call scenarios and training briefs
│           ├── lib/        # PocketBase client, speech, integrated AI server
│           └── routes/     # App pages and API resource routes
```

---

## License

MIT
