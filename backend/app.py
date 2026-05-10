from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta
from typing import Any, Optional

from fastapi import Depends, FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import connect, init_db, now, one, password_hash, password_ok
import os, uuid, smtplib, random
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import File, Form, UploadFile
from fastapi.staticfiles import StaticFiles
# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Traveloop API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SMTP — set these in your .env or server environment
# Gmail: enable 2FA → generate App Password → use as SMTP_PASS
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "deepak123mastermind@gmail.com")   # your Gmail address
SMTP_PASS = os.getenv("SMTP_PASS", "uofz grer ugyc licw")   # Gmail App Password
SMTP_FROM = os.getenv("SMTP_FROM", "travelverifyer")

UPLOAD_DIR = "uploads/photos"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
@app.on_event("startup")
def startup():
    init_db()
    with connect() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS otp_requests (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                email      TEXT NOT NULL,
                otp        TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used       INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reset_tokens (
                token      TEXT PRIMARY KEY,
                email      TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used       INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            );
        """)
    print("Traveloop API started")
    print("Demo login: demo@traveloop.test / password123")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def txt(value: Any, default: str = "") -> str:
    return default if value is None else str(value).strip()


def parse_day(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def day_span(start: str, end: str, inclusive: bool = False) -> int:
    d = (parse_day(end) - parse_day(start)).days
    return max(1, d + (1 if inclusive else 0))


def days_range(start: str, end: str) -> list[str]:
    first = parse_day(start)
    return [(first + timedelta(days=i)).isoformat() for i in range(day_span(start, end, True))]


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

def get_current_user(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    with connect() as conn:
        user = one(
            conn.execute(
                "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=?",
                (token,),
            ).fetchone()
        )
        try:
            conn.execute("ALTER TABLE stops ADD COLUMN budget REAL DEFAULT 0")
        except Exception:
            pass   # Column already exists — safe to ignore
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session")
    return user


def require_admin(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


def safe_user(user: dict) -> dict:
    return {k: user.get(k) for k in [
        "id", "first_name", "last_name", "name", "email",
        "phone", "city", "country", "bio", "photo_url", "language", "role",
    ]}


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class SignupBody(BaseModel):
    email: str
    password: str
    first_name: str = ""
    last_name: str = ""
    name: str = ""
    phone: str = ""
    city: str = ""
    country: str = ""
    bio: str = ""
    photo_url: str = ""
    language: str = "English"


class LoginBody(BaseModel):
    email: str
    password: str


class UpdateMeBody(BaseModel):
    first_name: str = ""
    last_name: str = ""
    name: str = ""
    email: str = ""
    phone: str = ""
    city: str = ""
    country: str = ""
    bio: str = ""
    photo_url: str = ""
    language: str = ""


class TripBody(BaseModel):
    name: str = ""
    description: str = ""
    start_date: str = ""
    end_date: str = ""
    cover_photo: str = ""
    budget_limit: float = 0.0


 
class StopBody(BaseModel):
    city_id: int = 0
    start_date: str = ""
    end_date: str = ""
    sort_order: int = 0
    transport_cost: float = 0.0
    budget: float = 0.0          # ← NEW: per-section budget
    notes: str = ""


class PlannedBody(BaseModel):
    activity_id: int
    activity_date: str = ""
    start_time: str = "09:00"
    custom_cost: Optional[float] = None
    notes: str = ""


class ExpenseBody(BaseModel):
    category: str = "extras"
    label: str = ""
    amount: float = 0.0
    expense_date: str = ""


class ChecklistBody(BaseModel):
    label: str = ""
    category: str = "General"


class ChecklistUpdateBody(BaseModel):
    label: str = ""
    category: str = ""
    is_packed: Optional[bool] = None


class NoteBody(BaseModel):
    title: str = ""
    body: str = ""
    note_date: str = ""
    stop_id: Optional[int] = None


class CommunityPostBody(BaseModel):
    body: str = ""
    category: str = "General"


class CommunityCommentBody(BaseModel):
    body: str = ""


class SaveCityBody(BaseModel):
    city_id: int


class AdminRoleBody(BaseModel):
    role: str
class ForgotPasswordBody(BaseModel):
    email: str

class VerifyOTPBody(BaseModel):
    email: str
    otp: str

class ResetPasswordBody(BaseModel):
    token: str
    password: str

# ---------------------------------------------------------------------------
# Shared DB logic
# ---------------------------------------------------------------------------

def get_own_trip(conn, user: dict, trip_id: int) -> dict:
    trip = one(conn.execute(
        "SELECT * FROM trips WHERE id=? AND user_id=?", (trip_id, user["id"])
    ).fetchone())
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


def get_own_stop(conn, user: dict, stop_id: int) -> dict:
    stop = one(conn.execute(
        "SELECT s.* FROM stops s JOIN trips t ON t.id=s.trip_id WHERE s.id=? AND t.user_id=?",
        (stop_id, user["id"]),
    ).fetchone())
    if not stop:
        raise HTTPException(status_code=404, detail="Stop not found")
    return stop


def get_stops(conn, trip_id: int) -> list[dict]:
    result = [dict(r) for r in conn.execute(
        """
        SELECT s.*, c.name AS city_name, c.country, c.region, c.cost_index,
               c.avg_hotel_cost, c.avg_meal_cost,
               c.image_url AS city_image, c.description AS city_description
        FROM stops s JOIN cities c ON c.id=s.city_id
        WHERE s.trip_id=? ORDER BY s.sort_order, s.start_date
        """,
        (trip_id,),
    )]
    for stop in result:
        stop["activities"] = [dict(r) for r in conn.execute(
            """
            SELECT pa.*, a.name, a.category, a.cost, a.duration_hours, a.image_url, a.description
            FROM planned_activities pa JOIN activities a ON a.id=pa.activity_id
            WHERE pa.stop_id=? ORDER BY pa.activity_date, pa.start_time
            """,
            (stop["id"],),
        )]
    return result


def build_full_trip(user: dict, trip_id: int) -> dict:
    with connect() as conn:
        trip = get_own_trip(conn, user, trip_id)
        trip["stops"] = get_stops(conn, trip_id)
        trip["checklist"] = [dict(r) for r in conn.execute(
            "SELECT * FROM checklist_items WHERE trip_id=? ORDER BY category,id", (trip_id,)
        )]
        trip["notes"] = [dict(r) for r in conn.execute(
            "SELECT * FROM notes WHERE trip_id=? ORDER BY note_date DESC,id DESC", (trip_id,)
        )]
        trip["expenses"] = [dict(r) for r in conn.execute(
            "SELECT * FROM expenses WHERE trip_id=? ORDER BY expense_date,id", (trip_id,)
        )]
    trip["budget"] = build_budget(user, trip_id)
    return trip


def build_budget(user: dict, trip_id: int) -> dict:
    with connect() as conn:
        trip = get_own_trip(conn, user, trip_id)
        stops = get_stops(conn, trip_id)
        expenses = [dict(r) for r in conn.execute(
            "SELECT * FROM expenses WHERE trip_id=?", (trip_id,)
        )]

    categories = {"transport": 0.0, "stay": 0.0, "activities": 0.0, "meals": 0.0, "extras": 0.0}
    daily = {d: 0.0 for d in days_range(trip["start_date"], trip["end_date"])}

    for stop in stops:
        nights = day_span(stop["start_date"], stop["end_date"])
        categories["transport"] += as_float(stop["transport_cost"])
        categories["stay"] += nights * as_float(stop["avg_hotel_cost"])
        categories["meals"] += (nights + 1) * as_float(stop["avg_meal_cost"])
        daily[stop["start_date"]] = daily.get(stop["start_date"], 0) + as_float(stop["transport_cost"])
        for activity in stop["activities"]:
            cost = as_float(activity["custom_cost"], as_float(activity["cost"]))
            categories["activities"] += cost
            daily[activity["activity_date"]] = daily.get(activity["activity_date"], 0) + cost

    for expense in expenses:
        cat = expense["category"] if expense["category"] in categories else "extras"
        categories[cat] += as_float(expense["amount"])
        if expense["expense_date"]:
            daily[expense["expense_date"]] = daily.get(expense["expense_date"], 0) + as_float(expense["amount"])

    total = round(sum(categories.values()), 2)
    per_day = total / max(1, len(daily))
    day_limit = as_float(trip["budget_limit"]) / max(1, len(daily)) if as_float(trip["budget_limit"]) else 0

    return {
        "categories": {k: round(v, 2) for k, v in categories.items()},
        "expenses": expenses,
        "daily": [{"date": d, "amount": round(v, 2)} for d, v in sorted(daily.items())],
        "overBudgetDays": [
            {"date": d, "amount": round(v, 2)}
            for d, v in sorted(daily.items())
            if day_limit and v > day_limit
        ],
        "total": total,
        "budgetLimit": as_float(trip["budget_limit"]),
        "averagePerDay": round(per_day, 2),
    }

def send_email(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    """Send an email via SMTP. Falls back to console print in dev if SMTP not configured."""
    if not SMTP_USER or not SMTP_PASS:
        print(f"[DEV EMAIL] To: {to_email} | Subject: {subject}\n{text_body}")
        return
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = SMTP_FROM
    msg["To"]      = to_email
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(SMTP_USER, SMTP_PASS)
        smtp.sendmail(SMTP_FROM, to_email, msg.as_string())
# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "database": "sqlite", "time": now()}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/api/auth/signup")
def signup(body: SignupBody):
    email = body.email.strip().lower()
    password = body.password
    first = txt(body.first_name)
    last  = txt(body.last_name)
    name  = txt(body.name) or f"{first} {last}".strip()

    if not name or "@" not in email or len(password) < 8:
        raise HTTPException(status_code=400, detail="Name, valid email, and 8 character password required")

    with connect() as conn:
        if conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone():
            raise HTTPException(status_code=409, detail="Email already registered")
        cur = conn.execute(
            """
            INSERT INTO users
            (first_name,last_name,name,email,password_hash,phone,city,country,bio,photo_url,language,role,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                first, last, name, email, password_hash(password),
                txt(body.phone), txt(body.city), txt(body.country),
                txt(body.bio), txt(body.photo_url),   # photo_url is already the server path
                txt(body.language, "English"), "user", now(),
            ),
        )
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)",
            (token, cur.lastrowid, now()),
        )
        user = one(conn.execute("SELECT * FROM users WHERE id=?", (cur.lastrowid,)).fetchone())

    # Send welcome email (non-blocking — failure won't break signup)
    try:
        send_email(
            to_email  = email,
            subject   = "Welcome to Traveloop! 🌍",
            html_body = f"""
                <h2>Welcome, {first or name}!</h2>
                <p>Your Traveloop account is ready. Start planning your first trip now.</p>
                <p>Email: <strong>{email}</strong></p>
                <br><p>– The Traveloop Team</p>
            """,
            text_body = f"Welcome to Traveloop, {first or name}!\n\nYour account is ready.\nEmail: {email}\n\n– The Traveloop Team",
        )
    except Exception as e:
        print(f"[WARN] Welcome email failed: {e}")

    return {"token": token, "user": safe_user(user)}
@app.post("/api/auth/login")
def login(body: LoginBody):
    print(body.email.strip().lower(), body.password)
    with connect() as conn:
        user = one(conn.execute(
            "SELECT * FROM users WHERE email=?", (body.email.strip().lower(),)
        ).fetchone())
        if not user or not password_ok(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)",
            (token, user["id"], now()),
        )
    return {"token": token, "user": safe_user(user)}


# ---------------------------------------------------------------------------
# Me
# ---------------------------------------------------------------------------

@app.get("/api/me")
def get_me(user: dict = Depends(get_current_user)):
    return {"user": safe_user(user)}


@app.put("/api/me")
def update_me(body: UpdateMeBody, user: dict = Depends(get_current_user)):
    fields = ["first_name", "last_name", "name", "email", "phone", "city", "country", "bio", "photo_url", "language"]
    values = [txt(getattr(body, f), user.get(f, "")) for f in fields]
    values[3] = values[3].lower()
    with connect() as conn:
        conn.execute(
            """
            UPDATE users SET first_name=?,last_name=?,name=?,email=?,phone=?,
            city=?,country=?,bio=?,photo_url=?,language=? WHERE id=?
            """,
            (*values, user["id"]),
        )
        updated = one(conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone())
    return {"user": safe_user(updated)}


@app.delete("/api/me")
def delete_me(user: dict = Depends(get_current_user)):
    with connect() as conn:
        conn.execute("DELETE FROM users WHERE id=?", (user["id"],))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@app.get("/api/dashboard")
def dashboard(user: dict = Depends(get_current_user)):
    with connect() as conn:
        trips = [dict(row) for row in conn.execute(
            """
            SELECT t.*, COUNT(s.id) AS destination_count
            FROM trips t LEFT JOIN stops s ON s.trip_id=t.id
            WHERE t.user_id=? GROUP BY t.id ORDER BY t.start_date LIMIT 5
            """,
            (user["id"],),
        )]
        cities = [dict(row) for row in conn.execute(
            "SELECT * FROM cities ORDER BY popularity DESC LIMIT 6"
        )]
    planned = sum(as_float(t["budget_limit"]) for t in trips)
    return {
        "user": safe_user(user),
        "recentTrips": trips,
        "popularCities": cities,
        "budget": {
            "activeTrips": len(trips),
            "plannedBudget": planned,
            "averageBudget": planned / len(trips) if trips else 0,
        },
    }


# ---------------------------------------------------------------------------
# Cities
# ---------------------------------------------------------------------------

@app.get("/api/cities")
def cities(
    q: str = Query(default=""),
    region: str = Query(default=""),
):
    sql = "SELECT * FROM cities"
    params: list = []
    filters = []
    if q:
        filters.append("(LOWER(name) LIKE ? OR LOWER(country) LIKE ? OR LOWER(description) LIKE ?)")
        params += [f"%{q.lower()}%", f"%{q.lower()}%", f"%{q.lower()}%"]
    if region:
        filters.append("LOWER(region)=?")
        params.append(region.lower())
    if filters:
        sql += " WHERE " + " AND ".join(filters)
    sql += " ORDER BY popularity DESC, cost_index"
    with connect() as conn:
        return {"cities": [dict(r) for r in conn.execute(sql, params)]}


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------

@app.get("/api/activities")
def activities(
    city_id: int = Query(default=0),
    category: str = Query(default=""),
    max_cost: str = Query(default=""),
):
    filters, params = [], []
    if city_id:
        filters.append("a.city_id=?")
        params.append(city_id)
    if category:
        filters.append("LOWER(a.category)=?")
        params.append(category.lower())
    if max_cost:
        filters.append("a.cost<=?")
        params.append(as_float(max_cost))
    sql = "SELECT a.*, c.name AS city_name, c.country FROM activities a JOIN cities c ON c.id=a.city_id"
    if filters:
        sql += " WHERE " + " AND ".join(filters)
    sql += " ORDER BY a.category, a.cost"
    with connect() as conn:
        return {"activities": [dict(r) for r in conn.execute(sql, params)]}


# ---------------------------------------------------------------------------
# Saved destinations
# ---------------------------------------------------------------------------

@app.get("/api/saved")
def get_saved(user: dict = Depends(get_current_user)):
    with connect() as conn:
        return {"cities": [dict(r) for r in conn.execute(
            "SELECT c.* FROM saved_destinations sd JOIN cities c ON c.id=sd.city_id WHERE sd.user_id=? ORDER BY sd.created_at DESC",
            (user["id"],),
        )]}


@app.post("/api/saved")
def save_city(body: SaveCityBody, user: dict = Depends(get_current_user)):
    with connect() as conn:
        city = one(conn.execute("SELECT * FROM cities WHERE id=?", (body.city_id,)).fetchone())
        if not city:
            raise HTTPException(status_code=404, detail="City not found")
        conn.execute(
            "INSERT OR IGNORE INTO saved_destinations (user_id,city_id,created_at) VALUES (?,?,?)",
            (user["id"], body.city_id, now()),
        )
    return {"city": city}


@app.delete("/api/saved/{city_id}")
def unsave_city(city_id: int, user: dict = Depends(get_current_user)):
    with connect() as conn:
        conn.execute(
            "DELETE FROM saved_destinations WHERE user_id=? AND city_id=?",
            (user["id"], city_id),
        )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Trips
# ---------------------------------------------------------------------------

@app.get("/api/trips")
def get_trips(user: dict = Depends(get_current_user)):
    with connect() as conn:
        return {"trips": [dict(row) for row in conn.execute(
            """
            SELECT t.*, COUNT(s.id) AS destination_count
            FROM trips t LEFT JOIN stops s ON s.trip_id=t.id
            WHERE t.user_id=? GROUP BY t.id ORDER BY t.start_date DESC
            """,
            (user["id"],),
        )]}


@app.post("/api/trips")
def create_trip(body: TripBody, user: dict = Depends(get_current_user)):
    if not body.name or not body.start_date or not body.end_date:
        raise HTTPException(status_code=400, detail="Trip name and dates are required")
    if parse_day(body.end_date) < parse_day(body.start_date):
        raise HTTPException(status_code=400, detail="End date must be after start date")
    stamp = now()
    with connect() as conn:
        trip_id = conn.execute(
            """
            INSERT INTO trips
            (user_id,name,description,start_date,end_date,cover_photo,budget_limit,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)
            """,
            (
                user["id"], body.name, body.description, body.start_date,
                body.end_date, body.cover_photo, body.budget_limit, stamp, stamp,
            ),
        ).lastrowid
    return {"trip": build_full_trip(user, trip_id)}


@app.get("/api/trips/{trip_id}")
def get_trip(trip_id: int, user: dict = Depends(get_current_user)):
    return {"trip": build_full_trip(user, trip_id)}


@app.put("/api/trips/{trip_id}")
def update_trip(trip_id: int, body: TripBody, user: dict = Depends(get_current_user)):
    with connect() as conn:
        trip = get_own_trip(conn, user, trip_id)
        conn.execute(
            """
            UPDATE trips SET name=?,description=?,start_date=?,end_date=?,
            cover_photo=?,budget_limit=?,updated_at=? WHERE id=?
            """,
            (
                txt(body.name, trip["name"]),
                txt(body.description, trip["description"]),
                txt(body.start_date, trip["start_date"]),
                txt(body.end_date, trip["end_date"]),
                txt(body.cover_photo, trip["cover_photo"]),
                body.budget_limit if body.budget_limit else as_float(trip["budget_limit"]),
                now(),
                trip_id,
            ),
        )
    return {"trip": build_full_trip(user, trip_id)}


@app.delete("/api/trips/{trip_id}")
def delete_trip(trip_id: int, user: dict = Depends(get_current_user)):
    with connect() as conn:
        get_own_trip(conn, user, trip_id)
        conn.execute("DELETE FROM trips WHERE id=?", (trip_id,))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Trip share & budget
# ---------------------------------------------------------------------------

@app.post("/api/trips/{trip_id}/share")
def share_trip(trip_id: int, user: dict = Depends(get_current_user)):
    with connect() as conn:
        trip = get_own_trip(conn, user, trip_id)
        token = trip["public_token"] or secrets.token_urlsafe(10)
        conn.execute(
            "UPDATE trips SET is_public=1,public_token=?,updated_at=? WHERE id=?",
            (token, now(), trip_id),
        )
    return {"token": token, "publicUrl": f"/public/{token}"}


@app.get("/api/trips/{trip_id}/budget")
def get_budget(trip_id: int, user: dict = Depends(get_current_user)):
    return {"budget": build_budget(user, trip_id)}


# ---------------------------------------------------------------------------
# Stops
# ---------------------------------------------------------------------------

@app.post("/api/trips/{trip_id}/stops")
def add_stop(trip_id: int, body: StopBody, user: dict = Depends(get_current_user)):
    with connect() as conn:
        get_own_trip(conn, user, trip_id)
        order = conn.execute(
            "SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM stops WHERE trip_id=?", (trip_id,)
        ).fetchone()["n"]
        stop_id = conn.execute(
            "INSERT INTO stops (trip_id,city_id,start_date,end_date,sort_order,transport_cost,budget,notes) VALUES (?,?,?,?,?,?,?,?)",
            (
                trip_id, body.city_id, body.start_date, body.end_date,
                body.sort_order or order,
                body.transport_cost,
                body.budget,           # ← NEW
                body.notes,
            ),
        ).lastrowid
        stop = one(conn.execute("SELECT * FROM stops WHERE id=?", (stop_id,)).fetchone())
    return {"stop": stop}


@app.put("/api/stops/{stop_id}")
def update_stop(stop_id: int, body: StopBody, user: dict = Depends(get_current_user)):
    with connect() as conn:
        stop = get_own_stop(conn, user, stop_id)
        conn.execute(
            "UPDATE stops SET city_id=?,start_date=?,end_date=?,sort_order=?,transport_cost=?,budget=?,notes=? WHERE id=?",
            (
                body.city_id or stop["city_id"],
                txt(body.start_date, stop["start_date"]),
                txt(body.end_date, stop["end_date"]),
                body.sort_order or stop["sort_order"],
                body.transport_cost if body.transport_cost else as_float(stop["transport_cost"]),
                body.budget if body.budget else as_float(stop.get("budget", 0)),   # ← NEW
                txt(body.notes, stop["notes"]),
                stop_id,
            ),
        )
        return {"stop": one(conn.execute("SELECT * FROM stops WHERE id=?", (stop_id,)).fetchone())}
@app.delete("/api/stops/{stop_id}")
def delete_stop(stop_id: int, user: dict = Depends(get_current_user)):
    with connect() as conn:
        get_own_stop(conn, user, stop_id)
        conn.execute("DELETE FROM stops WHERE id=?", (stop_id,))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Planned activities
# ---------------------------------------------------------------------------

@app.post("/api/stops/{stop_id}/activities")
def add_planned(stop_id: int, body: PlannedBody, user: dict = Depends(get_current_user)):
    with connect() as conn:
        stop = get_own_stop(conn, user, stop_id)
        activity = conn.execute(
            "SELECT id FROM activities WHERE id=? AND city_id=?",
            (body.activity_id, stop["city_id"]),
        ).fetchone()
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found for this stop")
        planned_id = conn.execute(
            "INSERT INTO planned_activities (stop_id,activity_id,activity_date,start_time,custom_cost,notes) VALUES (?,?,?,?,?,?)",
            (
                stop_id, body.activity_id,
                txt(body.activity_date, stop["start_date"]),
                txt(body.start_time, "09:00"),
                body.custom_cost, body.notes,
            ),
        ).lastrowid
        return {"planned": one(conn.execute("SELECT * FROM planned_activities WHERE id=?", (planned_id,)).fetchone())}


@app.delete("/api/planned/{planned_id}")
def delete_planned(planned_id: int, user: dict = Depends(get_current_user)):
    with connect() as conn:
        row = conn.execute(
            """
            SELECT pa.id FROM planned_activities pa
            JOIN stops s ON s.id=pa.stop_id
            JOIN trips t ON t.id=s.trip_id
            WHERE pa.id=? AND t.user_id=?
            """,
            (planned_id, user["id"]),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Planned activity not found")
        conn.execute("DELETE FROM planned_activities WHERE id=?", (planned_id,))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------

@app.post("/api/trips/{trip_id}/expenses")
def add_expense(trip_id: int, body: ExpenseBody, user: dict = Depends(get_current_user)):
    with connect() as conn:
        get_own_trip(conn, user, trip_id)
        expense_id = conn.execute(
            "INSERT INTO expenses (trip_id,category,label,amount,expense_date) VALUES (?,?,?,?,?)",
            (trip_id, txt(body.category, "extras"), body.label, body.amount, body.expense_date),
        ).lastrowid
        return {"expense": one(conn.execute("SELECT * FROM expenses WHERE id=?", (expense_id,)).fetchone())}


@app.delete("/api/expenses/{expense_id}")
def delete_expense(expense_id: int, user: dict = Depends(get_current_user)):
    with connect() as conn:
        row = conn.execute(
            "SELECT e.id FROM expenses e JOIN trips t ON t.id=e.trip_id WHERE e.id=? AND t.user_id=?",
            (expense_id, user["id"]),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Expense not found")
        conn.execute("DELETE FROM expenses WHERE id=?", (expense_id,))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Checklist
# ---------------------------------------------------------------------------

@app.get("/api/trips/{trip_id}/checklist")
def get_checklist(trip_id: int, user: dict = Depends(get_current_user)):
    with connect() as conn:
        get_own_trip(conn, user, trip_id)
        return {"items": [dict(r) for r in conn.execute(
            "SELECT * FROM checklist_items WHERE trip_id=? ORDER BY category,id", (trip_id,)
        )]}


@app.post("/api/trips/{trip_id}/checklist")
def add_checklist(trip_id: int, body: ChecklistBody, user: dict = Depends(get_current_user)):
    with connect() as conn:
        get_own_trip(conn, user, trip_id)
        item_id = conn.execute(
            "INSERT INTO checklist_items (trip_id,label,category,is_packed,created_at) VALUES (?,?,?,?,?)",
            (trip_id, body.label, txt(body.category, "General"), 0, now()),
        ).lastrowid
        return {"item": one(conn.execute("SELECT * FROM checklist_items WHERE id=?", (item_id,)).fetchone())}


@app.put("/api/checklist/{item_id}")
def update_checklist(item_id: int, body: ChecklistUpdateBody, user: dict = Depends(get_current_user)):
    with connect() as conn:
        item = one(conn.execute(
            "SELECT i.* FROM checklist_items i JOIN trips t ON t.id=i.trip_id WHERE i.id=? AND t.user_id=?",
            (item_id, user["id"]),
        ).fetchone())
        if not item:
            raise HTTPException(status_code=404, detail="Checklist item not found")
        conn.execute(
            "UPDATE checklist_items SET label=?,category=?,is_packed=? WHERE id=?",
            (
                txt(body.label, item["label"]),
                txt(body.category, item["category"]),
                1 if body.is_packed else 0,
                item_id,
            ),
        )
        return {"item": one(conn.execute("SELECT * FROM checklist_items WHERE id=?", (item_id,)).fetchone())}


@app.delete("/api/checklist/{item_id}")
def delete_checklist(item_id: int, user: dict = Depends(get_current_user)):
    with connect() as conn:
        item = one(conn.execute(
            "SELECT i.* FROM checklist_items i JOIN trips t ON t.id=i.trip_id WHERE i.id=? AND t.user_id=?",
            (item_id, user["id"]),
        ).fetchone())
        if not item:
            raise HTTPException(status_code=404, detail="Checklist item not found")
        conn.execute("DELETE FROM checklist_items WHERE id=?", (item_id,))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Notes
# ---------------------------------------------------------------------------

@app.get("/api/trips/{trip_id}/notes")
def get_notes(trip_id: int, user: dict = Depends(get_current_user)):
    with connect() as conn:
        get_own_trip(conn, user, trip_id)
        return {"notes": [dict(r) for r in conn.execute(
            "SELECT * FROM notes WHERE trip_id=? ORDER BY note_date DESC,id DESC", (trip_id,)
        )]}


@app.post("/api/trips/{trip_id}/notes")
def add_note(trip_id: int, body: NoteBody, user: dict = Depends(get_current_user)):
    with connect() as conn:
        get_own_trip(conn, user, trip_id)
        note_id = conn.execute(
            "INSERT INTO notes (trip_id,stop_id,title,body,note_date,created_at) VALUES (?,?,?,?,?,?)",
            (
                trip_id, body.stop_id or None, body.title, body.body,
                txt(body.note_date, date.today().isoformat()), now(),
            ),
        ).lastrowid
        return {"note": one(conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone())}


@app.put("/api/notes/{note_id}")
def update_note(note_id: int, body: NoteBody, user: dict = Depends(get_current_user)):
    with connect() as conn:
        note = one(conn.execute(
            "SELECT n.* FROM notes n JOIN trips t ON t.id=n.trip_id WHERE n.id=? AND t.user_id=?",
            (note_id, user["id"]),
        ).fetchone())
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        conn.execute(
            "UPDATE notes SET title=?,body=?,note_date=?,stop_id=? WHERE id=?",
            (
                txt(body.title, note["title"]),
                txt(body.body, note["body"]),
                txt(body.note_date, note["note_date"]),
                body.stop_id if body.stop_id is not None else note["stop_id"],
                note_id,
            ),
        )
        return {"note": one(conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone())}


@app.delete("/api/notes/{note_id}")
def delete_note(note_id: int, user: dict = Depends(get_current_user)):
    with connect() as conn:
        note = one(conn.execute(
            "SELECT n.* FROM notes n JOIN trips t ON t.id=n.trip_id WHERE n.id=? AND t.user_id=?",
            (note_id, user["id"]),
        ).fetchone())
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        conn.execute("DELETE FROM notes WHERE id=?", (note_id,))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Public & Community
# ---------------------------------------------------------------------------

@app.get("/api/public/{token}")
def public_trip(token: str):
    with connect() as conn:
        trip = one(conn.execute(
            "SELECT t.*, u.name AS owner_name FROM trips t JOIN users u ON u.id=t.user_id WHERE t.public_token=? AND t.is_public=1",
            (token,),
        ).fetchone())
        if not trip:
            raise HTTPException(status_code=404, detail="Shared trip not found")
        trip["stops"] = get_stops(conn, trip["id"])
    return {"trip": trip}


@app.get("/api/community")
def community(user: dict = Depends(get_current_user)):
    with connect() as conn:
        posts = [community_post_payload(conn, row["id"], user["id"]) for row in conn.execute(
            """
            SELECT p.id
            FROM community_posts p
            ORDER BY p.created_at DESC
            """
        )]
    return {"posts": posts}


def community_post_payload(conn, post_id: int, current_user_id: int) -> dict:
    post = one(conn.execute(
        """
        SELECT
          p.*,
          u.name AS owner_name,
          u.photo_url AS owner_photo,
          u.city AS owner_city,
          u.country AS owner_country,
          (SELECT COUNT(*) FROM community_likes l WHERE l.post_id=p.id) AS likes_count,
          (SELECT COUNT(*) FROM community_comments c WHERE c.post_id=p.id) AS comments_count,
          EXISTS(
            SELECT 1 FROM community_likes l
            WHERE l.post_id=p.id AND l.user_id=?
          ) AS liked_by_me
        FROM community_posts p
        JOIN users u ON u.id=p.user_id
        WHERE p.id=?
        """,
        (current_user_id, post_id),
    ).fetchone())
    if not post:
        raise HTTPException(status_code=404, detail="Community post not found")

    post["liked_by_me"] = bool(post["liked_by_me"])
    post["can_edit"] = post["user_id"] == current_user_id
    post["comments"] = [dict(row) for row in conn.execute(
        """
        SELECT
          c.*,
          u.name AS owner_name,
          u.photo_url AS owner_photo,
          CASE WHEN c.user_id=? THEN 1 ELSE 0 END AS can_edit
        FROM community_comments c
        JOIN users u ON u.id=c.user_id
        WHERE c.post_id=?
        ORDER BY c.created_at ASC
        """,
        (current_user_id, post_id),
    )]
    for comment in post["comments"]:
        comment["can_edit"] = bool(comment["can_edit"])
    return post


@app.post("/api/community")
def create_community_post(body: CommunityPostBody, user: dict = Depends(get_current_user)):
    post_body = txt(body.body)
    if not post_body:
        raise HTTPException(status_code=400, detail="Community message is required")
    with connect() as conn:
        post_id = conn.execute(
            """
            INSERT INTO community_posts (user_id,body,category,created_at,updated_at)
            VALUES (?,?,?,?,?)
            """,
            (user["id"], post_body, txt(body.category, "General") or "General", now(), now()),
        ).lastrowid
        return {"post": community_post_payload(conn, post_id, user["id"])}


@app.put("/api/community/{post_id}")
def update_community_post(post_id: int, body: CommunityPostBody, user: dict = Depends(get_current_user)):
    post_body = txt(body.body)
    if not post_body:
        raise HTTPException(status_code=400, detail="Community message is required")
    with connect() as conn:
        post = one(conn.execute("SELECT * FROM community_posts WHERE id=?", (post_id,)).fetchone())
        if not post:
            raise HTTPException(status_code=404, detail="Community post not found")
        if post["user_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Only the post owner can edit this message")
        conn.execute(
            "UPDATE community_posts SET body=?,category=?,updated_at=? WHERE id=?",
            (post_body, txt(body.category, post["category"]) or "General", now(), post_id),
        )
        return {"post": community_post_payload(conn, post_id, user["id"])}


@app.delete("/api/community/{post_id}")
def delete_community_post(post_id: int, user: dict = Depends(get_current_user)):
    with connect() as conn:
        post = one(conn.execute("SELECT * FROM community_posts WHERE id=?", (post_id,)).fetchone())
        if not post:
            raise HTTPException(status_code=404, detail="Community post not found")
        if post["user_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Only the post owner can delete this message")
        conn.execute("DELETE FROM community_posts WHERE id=?", (post_id,))
    return {"ok": True}


@app.post("/api/community/{post_id}/like")
def toggle_community_like(post_id: int, user: dict = Depends(get_current_user)):
    with connect() as conn:
        if not conn.execute("SELECT id FROM community_posts WHERE id=?", (post_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Community post not found")
        existing = conn.execute(
            "SELECT 1 FROM community_likes WHERE post_id=? AND user_id=?",
            (post_id, user["id"]),
        ).fetchone()
        if existing:
            conn.execute("DELETE FROM community_likes WHERE post_id=? AND user_id=?", (post_id, user["id"]))
        else:
            conn.execute(
                "INSERT INTO community_likes (post_id,user_id,created_at) VALUES (?,?,?)",
                (post_id, user["id"], now()),
            )
        return {"post": community_post_payload(conn, post_id, user["id"])}


@app.post("/api/community/{post_id}/comments")
def create_community_comment(post_id: int, body: CommunityCommentBody, user: dict = Depends(get_current_user)):
    comment_body = txt(body.body)
    if not comment_body:
        raise HTTPException(status_code=400, detail="Comment is required")
    with connect() as conn:
        if not conn.execute("SELECT id FROM community_posts WHERE id=?", (post_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Community post not found")
        conn.execute(
            """
            INSERT INTO community_comments (post_id,user_id,body,created_at,updated_at)
            VALUES (?,?,?,?,?)
            """,
            (post_id, user["id"], comment_body, now(), now()),
        )
        return {"post": community_post_payload(conn, post_id, user["id"])}


@app.put("/api/community/comments/{comment_id}")
def update_community_comment(comment_id: int, body: CommunityCommentBody, user: dict = Depends(get_current_user)):
    comment_body = txt(body.body)
    if not comment_body:
        raise HTTPException(status_code=400, detail="Comment is required")
    with connect() as conn:
        comment = one(conn.execute("SELECT * FROM community_comments WHERE id=?", (comment_id,)).fetchone())
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")
        if comment["user_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Only the comment owner can edit this comment")
        conn.execute(
            "UPDATE community_comments SET body=?,updated_at=? WHERE id=?",
            (comment_body, now(), comment_id),
        )
        return {"post": community_post_payload(conn, comment["post_id"], user["id"])}


@app.delete("/api/community/comments/{comment_id}")
def delete_community_comment(comment_id: int, user: dict = Depends(get_current_user)):
    with connect() as conn:
        comment = one(conn.execute("SELECT * FROM community_comments WHERE id=?", (comment_id,)).fetchone())
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")
        if comment["user_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Only the comment owner can delete this comment")
        post_id = comment["post_id"]
        conn.execute("DELETE FROM community_comments WHERE id=?", (comment_id,))
        return {"post": community_post_payload(conn, post_id, user["id"])}


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

@app.get("/api/admin/analytics")
def analytics(user: dict = Depends(require_admin)):
    with connect() as conn:
        counts = one(conn.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM users) users,
              (SELECT COUNT(*) FROM trips) trips,
              (SELECT COUNT(*) FROM stops) stops,
              (SELECT COUNT(*) FROM planned_activities) planned,
              (SELECT COUNT(*) FROM trips WHERE is_public=1) public_trips,
              (SELECT COUNT(*) FROM notes) notes,
              (SELECT COUNT(*) FROM expenses) expenses
            """
        ).fetchone())
        top_cities = [dict(r) for r in conn.execute(
            """
            SELECT c.name, c.country, c.region, COUNT(s.id) plans, ROUND(AVG(c.cost_index),1) cost_index
            FROM stops s JOIN cities c ON c.id=s.city_id
            GROUP BY c.id ORDER BY plans DESC, c.popularity DESC LIMIT 8
            """
        )]
        top_activities = [dict(r) for r in conn.execute(
            """
            SELECT a.name, a.category, c.name city, COUNT(pa.id) adds, ROUND(AVG(a.cost),2) avg_cost
            FROM planned_activities pa
            JOIN activities a ON a.id=pa.activity_id
            JOIN cities c ON c.id=a.city_id
            GROUP BY a.id ORDER BY adds DESC, a.cost DESC LIMIT 8
            """
        )]
        trip_trends = [dict(r) for r in conn.execute(
            """
            SELECT substr(created_at,1,10) date, COUNT(*) trips
            FROM trips GROUP BY substr(created_at,1,10) ORDER BY date LIMIT 14
            """
        )]
        trip_statuses = [dict(r) for r in conn.execute(
            """
            SELECT
              CASE
                WHEN date(end_date) < date('now') THEN 'Completed'
                WHEN date(start_date) <= date('now') AND date(end_date) >= date('now') THEN 'Ongoing'
                ELSE 'Upcoming'
              END status,
              COUNT(*) trips
            FROM trips GROUP BY status ORDER BY trips DESC
            """
        )]
        engagement = [dict(r) for r in conn.execute(
            """
            SELECT
              u.id, u.name, u.email, u.role, u.city, u.country, u.created_at,
              (SELECT COUNT(*) FROM trips t WHERE t.user_id=u.id) trips_created,
              (SELECT COUNT(*) FROM stops s JOIN trips t ON t.id=s.trip_id WHERE t.user_id=u.id) stops_added,
              (SELECT COUNT(*) FROM planned_activities pa JOIN stops s ON s.id=pa.stop_id JOIN trips t ON t.id=s.trip_id WHERE t.user_id=u.id) activities_planned,
              (SELECT COUNT(*) FROM notes n JOIN trips t ON t.id=n.trip_id WHERE t.user_id=u.id) notes_written,
              (SELECT COUNT(*) FROM trips t WHERE t.user_id=u.id AND t.is_public=1) public_trips,
              (SELECT COALESCE(SUM(t.budget_limit),0) FROM trips t WHERE t.user_id=u.id) planned_budget,
              (SELECT MAX(t.updated_at) FROM trips t WHERE t.user_id=u.id) last_trip_date
            FROM users u ORDER BY trips_created DESC, created_at DESC
            """
        )]
    return {
        "counts": counts,
        "topCities": top_cities,
        "topActivities": top_activities,
        "tripTrends": trip_trends,
        "tripStatuses": trip_statuses,
        "engagement": engagement,
        "users": engagement,
    }


@app.put("/api/admin/users/{user_id}")
def admin_update_user(user_id: int, body: AdminRoleBody, admin: dict = Depends(require_admin)):
    if body.role not in {"user", "admin"}:
        raise HTTPException(status_code=400, detail="Role must be user or admin")
    with connect() as conn:
        target = one(conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute("UPDATE users SET role=? WHERE id=?", (body.role, user_id))
        updated = one(conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())
    return {"user": safe_user(updated)}


@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: int, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Admins cannot delete their own account from this dashboard")
    with connect() as conn:
        if not conn.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone():
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))
    return {"ok": True}

@app.post("/api/upload/photo")
async def upload_photo(
    file:    UploadFile = File(...),
    old_url: str        = Form(default=""),  # frontend sends current photo path to delete
    authorization: str  = Header(default=""),
):
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WEBP, GIF images allowed.")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be smaller than 5 MB.")

    # Delete the previous file so re-uploading doesn't leave orphaned files
    if old_url:
        old_path = old_url.lstrip("/")   # "/uploads/photos/abc.jpg" → "uploads/photos/abc.jpg"
        if old_path.startswith("uploads/photos/") and os.path.isfile(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass  # ignore if already gone

    ext      = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(contents)

    url = f"/uploads/photos/{filename}"
    updated_user = None

    if authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        with connect() as conn:
            row = conn.execute("SELECT user_id FROM sessions WHERE token=?", (token,)).fetchone()
            if row:
                conn.execute("UPDATE users SET photo_url=? WHERE id=?", (url, row["user_id"]))
                updated_user = one(conn.execute("SELECT * FROM users WHERE id=?", (row["user_id"],)).fetchone())

    response = {"url": url}
    if updated_user:
        response["user"] = safe_user(updated_user)
    return response


@app.post("/api/auth/forgot-password")
def forgot_password(body: ForgotPasswordBody):
    email = body.email.strip().lower()
    with connect() as conn:
        user = one(conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone())
        if not user:
            # Don't reveal whether the email exists
            return {"ok": True}
        otp        = str(random.randint(100000, 999999))
        expires_at = (datetime.utcnow() + timedelta(minutes=10)).isoformat() + "Z"
        conn.execute("UPDATE otp_requests SET used=1 WHERE email=?", (email,))
        conn.execute(
            "INSERT INTO otp_requests (email,otp,expires_at,used,created_at) VALUES (?,?,?,0,?)",
            (email, otp, expires_at, now()),
        )
    try:
        send_email(
            to_email  = email,
            subject   = "Traveloop — Password Reset OTP",
            html_body = f"""
                <h2>Password Reset</h2>
                <p>Hi {user.get('first_name') or 'there'},</p>
                <p>Your one-time password is:</p>
                <h1 style="letter-spacing:8px;font-size:36px">{otp}</h1>
                <p>It expires in <strong>10 minutes</strong>.</p>
                <p>If you didn't request this, ignore this email.</p>
            """,
            text_body = f"Your Traveloop OTP is: {otp}\nExpires in 10 minutes.",
        )
    except Exception as e:
        print(f"[WARN] OTP email failed: {e}")
    return {"ok": True}


@app.post("/api/auth/verify-otp")
def verify_otp(body: VerifyOTPBody):
    email = body.email.strip().lower()
    with connect() as conn:
        record = one(conn.execute(
            "SELECT * FROM otp_requests WHERE email=? AND otp=? AND used=0 ORDER BY id DESC LIMIT 1",
            (email, body.otp),
        ).fetchone())
        if not record:
            raise HTTPException(status_code=400, detail="Invalid OTP.")
        if datetime.utcnow() > datetime.fromisoformat(record["expires_at"].rstrip("Z")):
            raise HTTPException(status_code=400, detail="OTP expired. Request a new one.")
        conn.execute("UPDATE otp_requests SET used=1 WHERE id=?", (record["id"],))
        reset_token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO reset_tokens (token,email,expires_at,used,created_at) VALUES (?,?,?,0,?)",
            (reset_token, email, (datetime.utcnow() + timedelta(minutes=15)).isoformat() + "Z", now()),
        )
    return {"ok": True, "reset_token": reset_token}


@app.post("/api/auth/reset-password")
def reset_password(body: ResetPasswordBody):
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    with connect() as conn:
        record = one(conn.execute(
            "SELECT * FROM reset_tokens WHERE token=? AND used=0", (body.token,)
        ).fetchone())
        if not record:
            raise HTTPException(status_code=400, detail="Invalid or expired reset link.")
        if datetime.utcnow() > datetime.fromisoformat(record["expires_at"].rstrip("Z")):
            raise HTTPException(status_code=400, detail="Reset link expired. Start over.")
        conn.execute(
            "UPDATE users SET password_hash=? WHERE email=?",
            (password_hash(body.password), record["email"]),
        )
        conn.execute("UPDATE reset_tokens SET used=1 WHERE token=?", (body.token,))
        user  = one(conn.execute("SELECT * FROM users WHERE email=?", (record["email"],)).fetchone())
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)",
            (token, user["id"], now()),
        )
    return {"token": token, "user": safe_user(user)}
# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8082, reload=True)
