# Traveloop

Traveloop is a modular full-stack travel planning project using:

- ReactJS frontend
- Python backend
- SQLite relational database

It implements the hackathon feature set: login/signup, dashboard, trip creation, trip list, itinerary builder, itinerary view, city search, activity search, budget and expenses, packing checklist, public sharing, profile/settings, trip notes, community/public trips, and admin analytics.

## Project Modules

```text
backend/
  app.py              HTTP API routes and request handling
  db.py               SQLite schema, seed data, password/session helpers
  requirements.txt    Backend dependency note

frontend/
  package.json        React/Vite dependencies and scripts
  vite.config.js      Dev server proxy to Python API
  index.html          React mount point
  src/
    api.js            Frontend API client and session storage
    App.jsx           App state, screen router, data orchestration
    components/
      Layout.jsx      Sidebar navigation and app shell
      ui.jsx          Buttons, panels, stats, formatting helpers
    screens/
      AuthScreen.jsx
      DashboardScreen.jsx
      TripScreens.jsx
      ItineraryScreens.jsx
      SearchScreens.jsx
      BudgetScreen.jsx
      UtilityScreens.jsx
    styles.css        Responsive UI styling
```

## Run The Project

Terminal 1:

```powershell
python backend/app.py
```

Terminal 2:

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

Demo login:

```text
demo@traveloop.test
password123
```

The SQLite database is created automatically at:

```text
backend/traveloop.sqlite3
```
"# odoo_hackathon_traveloop" 
