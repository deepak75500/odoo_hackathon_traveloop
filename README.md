# Traveloop Documentation

Traveloop is a full-stack travel planning application. It lets users create trips, add city stops, plan activities, track budget and expenses, maintain packing checklists and notes, share public itineraries, and use a small community feed.

The project is split into:

- `backend/`: FastAPI API server with SQLite storage.
- `frontend/`: React + Vite single page application.
- `backend/traveloop.sqlite3`: local SQLite database used by the backend.
## Architecture Diagram

![Traveloop Architecture](https://github.com/deepak75500/odoo_hackathon_traveloop/blob/main/architecture_of_traveloop.png?raw=true)
## Quick Start

### 1. Start The Backend

Open a terminal at the project root:

```powershell
cd backend
python -m pip install fastapi uvicorn python-multipart
python app.py
```

The backend runs on:

```text
http://localhost:8082
```

Health check:

```text
http://localhost:8082/api/health
```

### 2. Start The Frontend

Open a second terminal at the project root:

```powershell
cd frontend
npm install
npm run dev
```

The frontend runs on:

```text
http://localhost:5173
```

Vite proxies `/api` and `/uploads` to the backend in `frontend/vite.config.js`, so local frontend requests can call backend routes without setting `VITE_API_URL`.

### 3. Demo Login

The database seed creates:

```text
Email: demo@traveloop.test
Password: password123
Role: admin
```

The seed also creates example cities, activities, one public trip, expenses, checklist items, notes, and saved destinations.

## Project Structure

```text
GenAI_SampleConversations/
  backend/
    app.py                 FastAPI routes, request schemas, auth, business logic
    db.py                  SQLite connection, schema, seed data, password helpers
    requirements.txt       Backend note file
    traveloop.sqlite3      Local app database

  frontend/
    index.html             Vite HTML entry
    package.json           Frontend scripts and dependencies
    vite.config.js         Vite dev server and API proxy config
    src/
      main.jsx             React root render
      App.jsx              App state, screen routing, bootstrap flow
      api.js               API wrapper and session storage helpers
      styles.css           Shared app styling
      components/
        Layout.jsx         Sidebar navigation and app shell
        ui.jsx             Reusable buttons, panels, icons, formatters
      screens/
        AuthScreen.jsx         Login, signup, forgot password, profile photo upload
        DashboardScreen.jsx    Home/dashboard overview
        TripScreens.jsx        Create trip and trip listing
        ItineraryScreens.jsx   Trip builder and itinerary view
        SearchScreens.jsx      City search, activity search, community feed
        BudgetScreen.jsx       Expense invoice and budget breakdown
        UtilityScreens.jsx     Checklist, share, profile, notes, admin, public itinerary
```

Generated/runtime folders such as `frontend/node_modules`, `frontend/dist`, `backend/__pycache__`, and upload folders are not required in source documentation. They can be recreated by installs, builds, or app usage.

## Application Flow

### Startup Flow

1. Run `backend/app.py`.
2. FastAPI starts and calls `startup()`.
3. `startup()` calls `init_db()` from `backend/db.py`.
4. `init_db()` creates missing SQLite tables and seeds demo data if the demo user does not exist.
5. Run `frontend` with Vite.
6. Browser loads `frontend/src/main.jsx`.
7. `main.jsx` renders `App.jsx`.
8. `App.jsx` reads session data from local storage using `storedSession()`.
9. If there is no user session, the app shows `AuthScreen`.
10. If the URL contains `?public=<token>`, the app shows `PublicItinerary`.
11. If a user is logged in, `App.jsx` bootstraps dashboard, trips, cities, and saved destinations.

### Auth Flow

1. User signs up or logs in from `AuthScreen.jsx`.
2. Frontend calls `api.signup()` or `api.login()` from `api.js`.
3. Backend validates credentials and creates a row in `sessions`.
4. Backend returns a bearer token and safe user object.
5. Frontend stores them in local storage:
   - `traveloop_token`
   - `traveloop_user`
6. Future API requests include:

```text
Authorization: Bearer <token>
```

### Main App Navigation Flow

`App.jsx` owns the active `screen` state. The sidebar in `Layout.jsx` changes this state. Depending on the screen, `App.jsx` renders one of these modules:

- `dashboard`: `DashboardScreen`
- `trips`: `TripListScreen`
- `create`: `CreateTripScreen`
- `builder`: `BuilderScreen`
- `itinerary`: `ItineraryViewScreen`
- `cities`: `CitySearchScreen`
- `activities`: `ActivitySearchScreen`
- `budget`: `BudgetScreen`
- `checklist`: `ChecklistScreen`
- `community`: `CommunityScreen`
- `share`: `ShareScreen`
- `notes`: `NotesScreen`
- `profile`: `ProfileScreen`
- `admin`: `AdminScreen`

Most screens receive the same `sharedProps` object from `App.jsx`, including the current user, selected trip, trips list, cities list, refresh functions, and navigation helpers.

## Frontend Modules

### `frontend/src/api.js`

Central API client.

Responsibilities:

- Stores API origin and base path.
- Reads and writes auth session data.
- Adds bearer token to JSON API requests.
- Handles JSON response parsing and error messages.
- Uploads photos using `FormData`.
- Exposes route helpers such as `api.trips()`, `api.createTrip()`, `api.addStop()`, `api.community()`, and `api.analytics()`.

Important helpers:

- `storedSession()`: loads token and user from local storage.
- `saveSession(nextToken, user)`: updates token and user in local storage.
- `assetUrl(url)`: converts relative upload paths like `/uploads/photos/x.png` into full backend URLs.

### `frontend/src/App.jsx`

Top-level frontend controller.

Responsibilities:

- Loads initial user session.
- Tracks active screen.
- Loads dashboard, trips, cities, saved destinations.
- Tracks selected trip.
- Loads full selected trip details.
- Provides shared screen props.
- Handles logout and trip creation/deletion.
- Renders public itinerary mode when `?public=<token>` is present.

### `frontend/src/components/Layout.jsx`

App shell and sidebar navigation.

Responsibilities:

- Shows Traveloop brand.
- Renders main screen navigation buttons.
- Shows selected trip dropdown.
- Provides logout button.
- Wraps the active screen content.

### `frontend/src/components/ui.jsx`

Reusable UI helpers.

Includes:

- `Button`
- `IconButton`
- `Field`
- `PageHeader`
- `Panel`
- `EmptyState`
- `Stat`
- `TripSelect`
- `ImageBlock`
- `money()`
- `formatDate()`
- `shortDate()`
- `Icons`

### `frontend/src/screens/AuthScreen.jsx`

Authentication UI.

Responsibilities:

- Login
- Signup
- Forgot password / OTP reset flow
- Basic validation for email, phone, password
- Profile photo picking/upload during auth-related flows

Backend endpoints used:

- `POST /api/auth/login`
- `POST /api/auth/signup`
- `POST /api/auth/forgot-password`
- `POST /api/auth/verify-otp`
- `POST /api/auth/reset-password`
- `POST /api/upload/photo`

### `frontend/src/screens/DashboardScreen.jsx`

Home overview.

Responsibilities:

- Shows user greeting.
- Shows popular cities.
- Shows recent trips.
- Allows searching/filtering/sorting city cards.
- Allows navigation to trip, city search, profile, and create trip screens.

Backend data comes from:

- `GET /api/dashboard`
- `GET /api/trips`
- `GET /api/cities`

### `frontend/src/screens/TripScreens.jsx`

Contains two screens:

- `CreateTripScreen`
- `TripListScreen`

`CreateTripScreen` responsibilities:

- Create a new trip.
- Search city suggestions.
- Show suggested activities for selected city.
- Submit trip details to backend.

`TripListScreen` responsibilities:

- List all user trips.
- Filter by status.
- Search trips.
- Sort trips.
- Navigate to itinerary or builder.
- Delete trips.

Backend endpoints used:

- `GET /api/cities`
- `GET /api/activities`
- `POST /api/trips`
- `GET /api/trips`
- `DELETE /api/trips/{trip_id}`

### `frontend/src/screens/ItineraryScreens.jsx`

Contains two screens:

- `BuilderScreen`
- `ItineraryViewScreen`

`BuilderScreen` responsibilities:

- Add city stops to a trip.
- Set stop dates.
- Add transport cost and notes.
- Reorder stops.
- Remove stops.
- Preview planned activities by stop.

`ItineraryViewScreen` responsibilities:

- Display itinerary by day.
- Show activity cards and expense cards.
- Support list/calendar style itinerary views.
- Filter/group planned activities.
- Remove planned activities.

Backend endpoints used:

- `POST /api/trips/{trip_id}/stops`
- `PUT /api/stops/{stop_id}`
- `DELETE /api/stops/{stop_id}`
- `DELETE /api/planned/{planned_id}`

### `frontend/src/screens/SearchScreens.jsx`

Contains:

- `CitySearchScreen`
- `ActivitySearchScreen`
- `CommunityScreen`

`CitySearchScreen` responsibilities:

- Search destinations.
- Filter and sort cities.
- Add city as a trip stop.
- Save or unsave destinations.

`ActivitySearchScreen` responsibilities:

- Load activities for selected trip stop.
- Search/filter/sort activities.
- Add activity to the current stop.

`CommunityScreen` responsibilities:

- Show community posts.
- Create/edit/delete current user's posts.
- Like posts.
- Add/edit/delete comments.
- Filter/sort/group community content.

Backend endpoints used:

- `GET /api/cities`
- `GET /api/activities`
- `POST /api/trips/{trip_id}/stops`
- `POST /api/stops/{stop_id}/activities`
- `GET /api/saved`
- `POST /api/saved`
- `DELETE /api/saved/{city_id}`
- `GET /api/community`
- `POST /api/community`
- `PUT /api/community/{post_id}`
- `DELETE /api/community/{post_id}`
- `POST /api/community/{post_id}/like`
- `POST /api/community/{post_id}/comments`
- `PUT /api/community/comments/{comment_id}`
- `DELETE /api/community/comments/{comment_id}`

### `frontend/src/screens/BudgetScreen.jsx`

Budget and invoice screen.

Responsibilities:

- Loads backend budget summary for a trip.
- Builds invoice line items from stops, activities, transport, meals, stays, and manual expenses.
- Adds manual expenses.
- Deletes manual expenses.
- Shows budget donut chart and totals.
- Adds tax/discount locally for invoice preview.
- Uses browser print for PDF/download-style export.
- Estimates route transport costs using free external OSRM and Nominatim services.

Backend endpoints used:

- `GET /api/trips/{trip_id}/budget`
- `POST /api/trips/{trip_id}/expenses`
- `DELETE /api/expenses/{expense_id}`

### `frontend/src/screens/UtilityScreens.jsx`

Contains:

- `ChecklistScreen`
- `ShareScreen`
- `ProfileScreen`
- `NotesScreen`
- `AdminScreen`
- `PublicItinerary`

`ChecklistScreen`:

- Manage packing/checklist items.

`ShareScreen`:

- Generate public itinerary links.
- Copy public URL.

`ProfileScreen`:

- Edit user profile.
- Upload profile photo.
- View saved destinations and user trips.
- Delete account.

`NotesScreen`:

- Add/edit/delete trip notes.

`AdminScreen`:

- View analytics.
- Manage user roles.
- Delete users.

`PublicItinerary`:

- Loads public trip by token without requiring login.

Backend endpoints used:

- Checklist: `/api/trips/{trip_id}/checklist`, `/api/checklist/{item_id}`
- Share: `/api/trips/{trip_id}/share`
- Profile: `/api/me`, `/api/upload/photo`, `/api/saved`
- Notes: `/api/trips/{trip_id}/notes`, `/api/notes/{note_id}`
- Admin: `/api/admin/analytics`, `/api/admin/users/{user_id}`
- Public: `/api/public/{token}`

## Backend Modules

### `backend/db.py`

Database and seed module.

Responsibilities:

- Defines SQLite database path.
- Opens SQLite connections with row dictionaries and foreign keys enabled.
- Provides password hashing and verification.
- Defines all database tables in `SCHEMA`.
- Seeds initial cities, activities, demo admin user, sample trip, stops, activities, expenses, checklist items, notes, and saved destinations.

Important helpers:

- `connect()`: opens a SQLite connection.
- `one(row)`: converts a SQLite row to a dictionary.
- `password_hash(password)`: hashes user passwords.
- `password_ok(password, stored)`: verifies passwords.
- `init_db()`: creates schema and seeds data.

### `backend/app.py`

FastAPI server.

Responsibilities:

- Creates the FastAPI app.
- Enables CORS.
- Mounts `/uploads` for uploaded photos.
- Initializes database at startup.
- Defines request body schemas.
- Defines auth dependency and admin dependency.
- Implements all API routes.
- Handles trip, stop, activity, budget, checklist, notes, community, profile, upload, and admin logic.

## Backend API Overview

All protected endpoints require:

```text
Authorization: Bearer <token>
```

### Health

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Confirms backend and database status |

### Authentication And User

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/signup` | Create user account |
| POST | `/api/auth/login` | Login and receive token |
| GET | `/api/me` | Get current user |
| PUT | `/api/me` | Update current user |
| DELETE | `/api/me` | Delete current user account |
| POST | `/api/auth/forgot-password` | Generate OTP for reset |
| POST | `/api/auth/verify-otp` | Verify OTP and receive reset token |
| POST | `/api/auth/reset-password` | Reset password |
| POST | `/api/upload/photo` | Upload profile/trip photo |

### Dashboard And Discovery

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/dashboard` | Dashboard summary for current user |
| GET | `/api/cities` | Search/list cities |
| GET | `/api/activities` | Search/list activities |
| GET | `/api/saved` | List saved destinations |
| POST | `/api/saved` | Save destination |
| DELETE | `/api/saved/{city_id}` | Remove saved destination |

### Trips And Itinerary

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/trips` | List current user's trips |
| POST | `/api/trips` | Create trip |
| GET | `/api/trips/{trip_id}` | Load full trip |
| PUT | `/api/trips/{trip_id}` | Update trip |
| DELETE | `/api/trips/{trip_id}` | Delete trip |
| POST | `/api/trips/{trip_id}/share` | Create/refresh public token |
| GET | `/api/public/{token}` | Load public itinerary |

### Stops And Planned Activities

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/trips/{trip_id}/stops` | Add stop to trip |
| PUT | `/api/stops/{stop_id}` | Update stop |
| DELETE | `/api/stops/{stop_id}` | Delete stop |
| POST | `/api/stops/{stop_id}/activities` | Add planned activity |
| DELETE | `/api/planned/{planned_id}` | Delete planned activity |

### Budget And Expenses

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/trips/{trip_id}/budget` | Calculate trip budget |
| POST | `/api/trips/{trip_id}/expenses` | Add manual expense |
| DELETE | `/api/expenses/{expense_id}` | Delete manual expense |

### Checklist And Notes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/trips/{trip_id}/checklist` | List checklist items |
| POST | `/api/trips/{trip_id}/checklist` | Add checklist item |
| PUT | `/api/checklist/{item_id}` | Update checklist item |
| DELETE | `/api/checklist/{item_id}` | Delete checklist item |
| GET | `/api/trips/{trip_id}/notes` | List notes |
| POST | `/api/trips/{trip_id}/notes` | Add note |
| PUT | `/api/notes/{note_id}` | Update note |
| DELETE | `/api/notes/{note_id}` | Delete note |

### Community

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/community` | List community posts |
| POST | `/api/community` | Create community post |
| PUT | `/api/community/{post_id}` | Update own post |
| DELETE | `/api/community/{post_id}` | Delete own post |
| POST | `/api/community/{post_id}/like` | Toggle like |
| POST | `/api/community/{post_id}/comments` | Add comment |
| PUT | `/api/community/comments/{comment_id}` | Update own comment |
| DELETE | `/api/community/comments/{comment_id}` | Delete own comment |

### Admin

Admin endpoints require `role = admin`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/analytics` | Platform analytics |
| PUT | `/api/admin/users/{user_id}` | Change user role |
| DELETE | `/api/admin/users/{user_id}` | Delete user |

## Database Tables

| Table | Purpose |
| --- | --- |
| `users` | User profile, credentials, role |
| `sessions` | Bearer login sessions |
| `trips` | User-created trip plans |
| `cities` | Seeded city catalog |
| `activities` | Seeded activity catalog linked to cities |
| `stops` | Cities added to a trip with dates and transport cost |
| `planned_activities` | Activities scheduled for trip stops |
| `expenses` | Manual trip expenses |
| `checklist_items` | Packing/checklist records |
| `notes` | Trip notes |
| `saved_destinations` | User saved cities |
| `community_posts` | Community feed posts |
| `community_comments` | Comments on community posts |
| `community_likes` | Likes on community posts |
| `otp_requests` | Password reset OTP records created at backend startup |
| `reset_tokens` | Password reset tokens created at backend startup |

## Budget Calculation

Backend budget totals are calculated in `build_budget()` in `backend/app.py`.

The backend adds:

- Transport cost from each stop.
- Stay cost from nights per stop multiplied by city average hotel cost.
- Meal cost from trip days multiplied by city average meal cost.
- Planned activity costs.
- Manual expenses from `expenses`.

The frontend budget screen additionally supports:

- Invoice display.
- Local tax percentage.
- Local discount.
- Paid/unpaid visual state.
- Browser print export.
- External route estimate display using OSRM/Nominatim.

## Public Sharing Flow

1. User opens `ShareScreen`.
2. User clicks create/refresh link.
3. Frontend calls `POST /api/trips/{trip_id}/share`.
4. Backend marks trip public and creates a public token.
5. Frontend shows a URL like:

```text
http://localhost:5173/?public=<token>
```

6. When that URL loads, `App.jsx` detects `public` query param and renders `PublicItinerary`.
7. `PublicItinerary` calls `GET /api/public/{token}`.

## Admin Flow

1. User must have `role = admin`.
2. `AdminScreen` calls `/api/admin/analytics`.
3. Backend aggregates:
   - User count
   - Trip count
   - Planned activity count
   - Public trip count
   - Top cities
   - Top activities
   - Trip status breakdown
   - User engagement
4. Admin can update user role or delete users.

## Environment And Configuration

Environment examples are provided in:

```text
.env.example
backend/.env.example
frontend/.env.example
```

Copy the example you need and fill in real values locally. Real `.env` files are ignored by Git through `.gitignore`.

### Frontend API URL

During local development, Vite proxy handles requests:

```js
server: {
  proxy: {
    "/api": "http://localhost:8082",
    "/uploads": "http://localhost:8082"
  }
}
```

For a deployed frontend, set:

```text
VITE_API_URL=https://your-backend-host
```

Create `frontend/.env` from `frontend/.env.example` when needed:

```powershell
cd frontend
copy .env.example .env
```

### Email / SMTP

Password reset email uses these environment variables:

```text
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_FROM
```

Create `backend/.env` from `backend/.env.example` for reference:

```powershell
cd backend
copy .env.example .env
```

Important: `backend/app.py` reads environment variables through `os.getenv()`. If you run with `python app.py`, set the variables in the shell before starting the server:

```powershell
$env:SMTP_HOST="smtp.gmail.com"
$env:SMTP_PORT="587"
$env:SMTP_USER="your-email@gmail.com"
$env:SMTP_PASS="your-gmail-app-password"
$env:SMTP_FROM="Traveloop <your-email@gmail.com>"
python app.py
```

If SMTP fails, the backend currently logs the warning and still returns reset data for local/demo use.

## Common Development Commands

Backend:

```powershell
cd backend
python app.py
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Build frontend:

```powershell
cd frontend
npm run build
```

Preview production build:

```powershell
cd frontend
npm run preview
```

## Troubleshooting

### Frontend cannot reach backend

Check:

- Backend is running on `http://localhost:8082`.
- Frontend is running through Vite, not opened directly as a file.
- `frontend/vite.config.js` has proxy entries for `/api` and `/uploads`.

### Login says missing bearer token

This usually means the frontend has no saved token.

Fix:

- Log out and log in again.
- Clear browser local storage keys:
  - `traveloop_token`
  - `traveloop_user`

### Uploaded images do not show

Check:

- Backend is running.
- `/uploads` is mounted in `backend/app.py`.
- Frontend uses `assetUrl()` for relative upload paths.

### Database looks stale

The app uses:

```text
backend/traveloop.sqlite3
```

To reset seed data during development, stop the backend, remove the SQLite file, and start the backend again. The startup process will recreate tables and seed demo data.

### Frontend dependencies missing

Run:

```powershell
cd frontend
npm install
```

`node_modules` is generated and should not be manually edited.

## Notes For Future Developers

- Keep generated folders out of source changes:
  - `frontend/node_modules`
  - `frontend/dist`
  - `backend/__pycache__`
  - upload folders
- Keep API calls centralized in `frontend/src/api.js`.
- Add new screens through `App.jsx` and `Layout.jsx`.
- Add new backend route schemas as Pydantic models in `backend/app.py`.
- Keep database schema changes in `backend/db.py`.
- Be careful with `backend/traveloop.sqlite3`; it can contain local test data.
