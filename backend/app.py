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

def as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


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


def not_found(msg: str = "Not found"):
    raise HTTPException(status_code=404, detail=msg)


def bad_request(msg: str):
    raise HTTPException(status_code=400, detail=msg)


def forbidden(msg: str = "Forbidden"):
    raise HTTPException(status_code=403, detail=msg)


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
            "INSERT INTO stops (trip_id,city_id,start_date,end_date,sort_order,transport_cost,notes) VALUES (?,?,?,?,?,?,?)",
            (
                trip_id, body.city_id, body.start_date, body.end_date,
                body.sort_order or order, body.transport_cost, body.notes,
            ),
        ).lastrowid
        stop = one(conn.execute("SELECT * FROM stops WHERE id=?", (stop_id,)).fetchone())
    return {"stop": stop}


@app.put("/api/stops/{stop_id}")
def update_stop(stop_id: int, body: StopBody, user: dict = Depends(get_current_user)):
    with connect() as conn:
        stop = get_own_stop(conn, user, stop_id)
        conn.execute(
            "UPDATE stops SET city_id=?,start_date=?,end_date=?,sort_order=?,transport_cost=?,notes=? WHERE id=?",
            (
                body.city_id or stop["city_id"],
                txt(body.start_date, stop["start_date"]),
                txt(body.end_date, stop["end_date"]),
                body.sort_order or stop["sort_order"],
                body.transport_cost if body.transport_cost else as_float(stop["transport_cost"]),
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
def community():
    with connect() as conn:
        return {"trips": [dict(r) for r in conn.execute(
            """
            SELECT t.id,t.name,t.description,t.start_date,t.end_date,t.cover_photo,
                   t.public_token,u.name AS owner_name, COUNT(s.id) AS destination_count
            FROM trips t JOIN users u ON u.id=t.user_id LEFT JOIN stops s ON s.trip_id=t.id
            WHERE t.is_public=1 GROUP BY t.id ORDER BY t.updated_at DESC
            """
        )]}


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

# ---------------------------------------------------------------------------
# Add these imports at the top of app.py (alongside existing imports)
# ---------------------------------------------------------------------------
import os
import uuid
from fastapi import File, UploadFile
from fastapi.staticfiles import StaticFiles

# ---------------------------------------------------------------------------
# Add this after app = FastAPI(...) and middleware setup
# ---------------------------------------------------------------------------

# Create uploads folder if it doesn't exist
UPLOAD_DIR = "uploads/photos"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Serve the uploads folder as static files so frontend can display images
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ---------------------------------------------------------------------------
# Add this new route anywhere in app.py
# ---------------------------------------------------------------------------

@app.post("/api/upload/photo")
async def upload_photo(
    file:    UploadFile = File(...),
    old_url: str        = Form(default=""),  # frontend sends current photo path to delete
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

    return {"url": f"/uploads/photos/{filename}"}
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
# ─────────────────────────────────────────────────────────────
# ADD THESE ENDPOINTS TO YOUR EXISTING app.py
# All use your existing g.db, ok(), err(), rows(), auth helpers
# ─────────────────────────────────────────────────────────────


# ── CITIES (Screen 3 Landing, Screen 4 Create, Screen 8 Search) ──

@app.route("/api/cities")
def get_cities():
    """All cities with their activities nested."""
    city_rows = rows(g.db.execute(
        "SELECT * FROM cities ORDER BY popularity DESC"
    ))
    act_rows = rows(g.db.execute(
        "SELECT * FROM activities ORDER BY city_id, name"
    ))
    act_map = {}
    for a in act_rows:
        act_map.setdefault(a["city_id"], []).append(a)
    for c in city_rows:
        c["activities"] = act_map.get(c["id"], [])
    return ok(cities=city_rows)


# ── TRIPS (Screens 3, 4, 6, 9) ────────────────────────────────

@app.route("/api/trips")
               # keep your existing decorator
def get_trips():
    """All trips for current user, with stops + activities nested."""
    trip_rows = rows(g.db.execute(
        "SELECT * FROM trips WHERE user_id=? ORDER BY start_date DESC",
        (g.user["id"],)
    ))
    for trip in trip_rows:
        trip["stops"] = _load_stops(trip["id"])
        trip["expenses"] = rows(g.db.execute(
            "SELECT * FROM expenses WHERE trip_id=?", (trip["id"],)
        ))
    return ok(trips=trip_rows)


@app.route("/api/trips", methods=["POST"])

def create_trip():
    """Create a new trip (Screen 4)."""
    b = request.get_json(silent=True) or {}
    if not b.get("name") or not b.get("start_date") or not b.get("end_date"):
        return err("name, start_date, end_date required")
    ts = now()
    cur = g.db.execute(
        """INSERT INTO trips
           (user_id,name,description,start_date,end_date,cover_photo,
            budget_limit,is_public,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,0,?,?)""",
        (g.user["id"], b["name"], b.get("description",""),
         b["start_date"], b["end_date"], b.get("cover_photo",""),
         float(b.get("budget_limit") or 0), ts, ts)
    )
    trip = one(g.db.execute("SELECT * FROM trips WHERE id=?", (cur.lastrowid,)).fetchone())
    trip["stops"] = []
    trip["expenses"] = []
    return ok(trip=trip), 201


@app.route("/api/trips/<int:trip_id>")

def get_trip(trip_id):
    """Single trip with full nested data (Screen 9 Itinerary View)."""
    trip = one(g.db.execute(
        "SELECT * FROM trips WHERE id=? AND user_id=?",
        (trip_id, g.user["id"])
    ).fetchone())
    if not trip:
        return err("Trip not found", 404)
    trip["stops"]     = _load_stops(trip_id)
    trip["expenses"]  = rows(g.db.execute("SELECT * FROM expenses  WHERE trip_id=?", (trip_id,)))
    trip["checklist"] = rows(g.db.execute("SELECT * FROM checklist_items WHERE trip_id=?", (trip_id,)))
    trip["notes"]     = rows(g.db.execute("SELECT * FROM notes WHERE trip_id=? ORDER BY note_date", (trip_id,)))
    return ok(trip=trip)


@app.route("/api/trips/<int:trip_id>", methods=["PUT"])

def update_trip(trip_id):
    """Update trip details."""
    trip = one(g.db.execute("SELECT * FROM trips WHERE id=? AND user_id=?", (trip_id, g.user["id"])).fetchone())
    if not trip:
        return err("Trip not found", 404)
    b = request.get_json(silent=True) or {}
    g.db.execute(
        """UPDATE trips SET name=?,description=?,start_date=?,end_date=?,
           cover_photo=?,budget_limit=?,updated_at=? WHERE id=?""",
        (b.get("name", trip["name"]), b.get("description", trip["description"]),
         b.get("start_date", trip["start_date"]), b.get("end_date", trip["end_date"]),
         b.get("cover_photo", trip["cover_photo"]),
         float(b.get("budget_limit") or trip["budget_limit"]),
         now(), trip_id)
    )
    return ok(message="updated")


@app.route("/api/trips/<int:trip_id>", methods=["DELETE"])

def delete_trip(trip_id):
    """Delete a trip (cascade handles stops, activities, expenses)."""
    g.db.execute("DELETE FROM trips WHERE id=? AND user_id=?", (trip_id, g.user["id"]))
    return ok(message="deleted")


# ── STOPS (Screen 5 Build Itinerary) ──────────────────────────

@app.route("/api/trips/<int:trip_id>/stops", methods=["POST"])

def add_stop(trip_id):
    """Add a stop to a trip."""
    trip = one(g.db.execute("SELECT id FROM trips WHERE id=? AND user_id=?", (trip_id, g.user["id"])).fetchone())
    if not trip:
        return err("Trip not found", 404)
    b = request.get_json(silent=True) or {}
    if not b.get("city_id") or not b.get("start_date") or not b.get("end_date"):
        return err("city_id, start_date, end_date required")
    cur = g.db.execute(
        """INSERT INTO stops (trip_id,city_id,start_date,end_date,sort_order,transport_cost,notes)
           VALUES (?,?,?,?,?,?,?)""",
        (trip_id, int(b["city_id"]), b["start_date"], b["end_date"],
         int(b.get("sort_order") or 1),
         float(b.get("transport_cost") or 0),
         b.get("notes",""))
    )
    g.db.execute("UPDATE trips SET updated_at=? WHERE id=?", (now(), trip_id))
    stop = _load_stop(cur.lastrowid)
    return ok(stop=stop), 201


@app.route("/api/stops/<int:stop_id>", methods=["DELETE"])

def delete_stop(stop_id):
    """Remove a stop (cascade removes planned activities)."""
    g.db.execute("DELETE FROM stops WHERE id=?", (stop_id,))
    return ok(message="deleted")


# ── PLANNED ACTIVITIES (Screens 8, 9) ─────────────────────────

@app.route("/api/stops/<int:stop_id>/activities", methods=["POST"])

def add_planned_activity(stop_id):
    """Plan an activity for a stop."""
    b = request.get_json(silent=True) or {}
    if not b.get("activity_id") or not b.get("activity_date"):
        return err("activity_id and activity_date required")
    cur = g.db.execute(
        """INSERT INTO planned_activities
           (stop_id,activity_id,activity_date,start_time,custom_cost,notes)
           VALUES (?,?,?,?,?,?)""",
        (stop_id, int(b["activity_id"]), b["activity_date"],
         b.get("start_time","09:00"),
         float(b["custom_cost"]) if b.get("custom_cost") is not None else None,
         b.get("notes",""))
    )
    return ok(id=cur.lastrowid), 201


@app.route("/api/planned/<int:planned_id>", methods=["DELETE"])

def delete_planned_activity(planned_id):
    """Remove a planned activity."""
    g.db.execute("DELETE FROM planned_activities WHERE id=?", (planned_id,))
    return ok(message="deleted")


# ── EXPENSES (Screen 14 Invoice) ───────────────────────────────

@app.route("/api/trips/<int:trip_id>/expenses", methods=["POST"])

def add_expense(trip_id):
    """Add an expense to a trip."""
    trip = one(g.db.execute("SELECT id FROM trips WHERE id=? AND user_id=?", (trip_id, g.user["id"])).fetchone())
    if not trip:
        return err("Trip not found", 404)
    b = request.get_json(silent=True) or {}
    if not b.get("label") or b.get("amount") is None:
        return err("label and amount required")
    cur = g.db.execute(
        "INSERT INTO expenses (trip_id,category,label,amount,expense_date) VALUES (?,?,?,?,?)",
        (trip_id, b.get("category","extras"), b["label"],
         float(b["amount"]), b.get("expense_date",""))
    )
    return ok(id=cur.lastrowid), 201


@app.route("/api/expenses/<int:expense_id>", methods=["DELETE"])

def delete_expense(expense_id):
    """Delete an expense."""
    g.db.execute("DELETE FROM expenses WHERE id=?", (expense_id,))
    return ok(message="deleted")


# ── SHARE / PUBLIC TOKEN (Share Screen) ───────────────────────

@app.route("/api/trips/<int:trip_id>/share", methods=["POST"])

def share_trip(trip_id):
    """Generate or refresh a public token."""
    trip = one(g.db.execute("SELECT * FROM trips WHERE id=? AND user_id=?", (trip_id, g.user["id"])).fetchone())
    if not trip:
        return err("Trip not found", 404)
    token = trip["public_token"] or secrets.token_urlsafe(16)
    g.db.execute(
        "UPDATE trips SET is_public=1, public_token=?, updated_at=? WHERE id=?",
        (token, now(), trip_id)
    )
    return ok(token=token)


# ── PUBLIC ITINERARY (Screen 10 Community + PublicItinerary) ──

@app.route("/api/public/trips")
def public_trips():
    """All public trips for Community tab (Screen 10)."""
    trip_rows = rows(g.db.execute(
        """SELECT t.*, u.name as owner_name, u.photo_url as owner_photo
           FROM trips t JOIN users u ON u.id=t.user_id
           WHERE t.is_public=1
           ORDER BY t.updated_at DESC"""
    ))
    for trip in trip_rows:
        trip["stops"] = _load_stops(trip["id"])
    return ok(trips=trip_rows)


@app.route("/api/public/<token>")
def public_trip(token):
    """Single public trip by token (PublicItinerary view)."""
    trip = one(g.db.execute(
        """SELECT t.*, u.name as owner_name
           FROM trips t JOIN users u ON u.id=t.user_id
           WHERE t.public_token=? AND t.is_public=1""",
        (token,)
    ).fetchone())
    if not trip:
        return err("Not found", 404)
    trip["stops"] = _load_stops(trip["id"])
    return ok(trip=trip)


# ── SAVED DESTINATIONS (Profile Screen) ───────────────────────

@app.route("/api/saved")

def get_saved():
    """Saved cities for current user."""
    city_rows = rows(g.db.execute(
        """SELECT c.* FROM cities c
           JOIN saved_destinations sd ON sd.city_id=c.id
           WHERE sd.user_id=? ORDER BY sd.created_at DESC""",
        (g.user["id"],)
    ))
    return ok(cities=city_rows)


@app.route("/api/saved/<int:city_id>", methods=["POST"])

def save_city(city_id):
    """Save a city to favourites."""
    g.db.execute(
        "INSERT OR IGNORE INTO saved_destinations (user_id,city_id,created_at) VALUES (?,?,?)",
        (g.user["id"], city_id, now())
    )
    return ok(message="saved"), 201


@app.route("/api/saved/<int:city_id>", methods=["DELETE"])

def unsave_city(city_id):
    """Remove a saved city."""
    g.db.execute(
        "DELETE FROM saved_destinations WHERE user_id=? AND city_id=?",
        (g.user["id"], city_id)
    )
    return ok(message="removed")


# ── CHECKLIST (Screen 11) ──────────────────────────────────────

@app.route("/api/trips/<int:trip_id>/checklist", methods=["POST"])

def add_checklist(trip_id):
    """Add a checklist item."""
    b = request.get_json(silent=True) or {}
    if not b.get("label"):
        return err("label required")
    cur = g.db.execute(
        "INSERT INTO checklist_items (trip_id,label,category,is_packed,created_at) VALUES (?,?,?,0,?)",
        (trip_id, b["label"], b.get("category","General"), now())
    )
    return ok(id=cur.lastrowid), 201


@app.route("/api/checklist/<int:item_id>", methods=["PUT"])

def update_checklist(item_id):
    """Toggle packed state."""
    b = request.get_json(silent=True) or {}
    g.db.execute(
        "UPDATE checklist_items SET is_packed=?, label=?, category=? WHERE id=?",
        (int(b.get("is_packed", 0)), b.get("label",""), b.get("category","General"), item_id)
    )
    return ok(message="updated")


@app.route("/api/checklist/<int:item_id>", methods=["DELETE"])

def delete_checklist(item_id):
    """Delete a checklist item."""
    g.db.execute("DELETE FROM checklist_items WHERE id=?", (item_id,))
    return ok(message="deleted")


# ── NOTES (Screen 13) ─────────────────────────────────────────

@app.route("/api/trips/<int:trip_id>/notes", methods=["POST"])

def add_note(trip_id):
    """Add a trip note."""
    b = request.get_json(silent=True) or {}
    if not b.get("title") or not b.get("body"):
        return err("title and body required")
    cur = g.db.execute(
        "INSERT INTO notes (trip_id,stop_id,title,body,note_date,created_at) VALUES (?,?,?,?,?,?)",
        (trip_id, b.get("stop_id"), b["title"], b["body"],
         b.get("note_date", now()[:10]), now())
    )
    return ok(id=cur.lastrowid), 201


@app.route("/api/notes/<int:note_id>", methods=["DELETE"])

def delete_note(note_id):
    """Delete a note."""
    g.db.execute("DELETE FROM notes WHERE id=?", (note_id,))
    return ok(message="deleted")


# ── ADMIN ANALYTICS (Screen 12) ───────────────────────────────

@app.route("/api/admin/analytics")

def analytics():
    """Admin-only platform analytics."""
    if g.user.get("role") != "admin":
        return err("Admin only", 403)

    counts = {
        "users":        g.db.execute("SELECT COUNT(*) FROM users").fetchone()[0],
        "trips":        g.db.execute("SELECT COUNT(*) FROM trips").fetchone()[0],
        "planned":      g.db.execute("SELECT COUNT(*) FROM planned_activities").fetchone()[0],
        "public_trips": g.db.execute("SELECT COUNT(*) FROM trips WHERE is_public=1").fetchone()[0],
    }

    trip_trends = rows(g.db.execute(
        """SELECT substr(created_at,1,10) as date, COUNT(*) as trips
           FROM trips GROUP BY date ORDER BY date DESC LIMIT 14"""
    ))

    trip_statuses = []
    today = now()[:10]
    for status, cond in [
        ("Ongoing",   f"start_date<='{today}' AND end_date>='{today}'"),
        ("Upcoming",  f"start_date>'{today}'"),
        ("Completed", f"end_date<'{today}'"),
    ]:
        count = g.db.execute(f"SELECT COUNT(*) FROM trips WHERE {cond}").fetchone()[0]
        trip_statuses.append({"status": status, "trips": count})

    top_cities = rows(g.db.execute(
        """SELECT c.name,c.country,c.region,c.cost_index,
                  COUNT(s.id) as plans
           FROM cities c LEFT JOIN stops s ON s.city_id=c.id
           GROUP BY c.id ORDER BY plans DESC LIMIT 8"""
    ))

    top_activities = rows(g.db.execute(
        """SELECT a.name,a.category,c.name as city,a.cost as avg_cost,
                  COUNT(pa.id) as adds
           FROM activities a
           LEFT JOIN planned_activities pa ON pa.activity_id=a.id
           JOIN cities c ON c.id=a.city_id
           GROUP BY a.id ORDER BY adds DESC LIMIT 8"""
    ))

    engagement = rows(g.db.execute(
        """SELECT u.id,u.name,u.email,
                  COUNT(DISTINCT t.id)  as trips_created,
                  COUNT(DISTINCT s.id)  as stops_added,
                  COUNT(DISTINCT pa.id) as activities_planned,
                  COUNT(DISTINCT n.id)  as notes_written
           FROM users u
           LEFT JOIN trips t  ON t.user_id=u.id
           LEFT JOIN stops s  ON s.trip_id=t.id
           LEFT JOIN planned_activities pa ON pa.stop_id=s.id
           LEFT JOIN notes n  ON n.trip_id=t.id
           GROUP BY u.id ORDER BY trips_created DESC LIMIT 10"""
    ))

    users = rows(g.db.execute(
        """SELECT u.id,u.name,u.email,u.role,
                  COUNT(DISTINCT t.id)  as trips_created,
                  COUNT(DISTINCT pa.id) as activities_planned,
                  SUM(CASE WHEN t.is_public=1 THEN 1 ELSE 0 END) as public_trips,
                  COALESCE(SUM(t.budget_limit),0) as planned_budget,
                  MAX(t.updated_at) as last_trip_date
           FROM users u
           LEFT JOIN trips t  ON t.user_id=u.id
           LEFT JOIN stops s  ON s.trip_id=t.id
           LEFT JOIN planned_activities pa ON pa.stop_id=s.id
           GROUP BY u.id ORDER BY u.created_at DESC"""
    ))

    return ok(
        counts=counts,
        tripTrends=trip_trends,
        tripStatuses=trip_statuses,
        topCities=top_cities,
        topActivities=top_activities,
        engagement=engagement,
        users=users,
    )


@app.route("/api/admin/users/<int:user_id>", methods=["PUT"])

def admin_update_user(user_id):
    if g.user.get("role") != "admin":
        return err("Admin only", 403)
    b = request.get_json(silent=True) or {}
    g.db.execute("UPDATE users SET role=? WHERE id=?", (b.get("role","user"), user_id))
    return ok(message="updated")


@app.route("/api/admin/users/<int:user_id>", methods=["DELETE"])

def admin_delete_user(user_id):
    if g.user.get("role") != "admin":
        return err("Admin only", 403)
    if user_id == g.user["id"]:
        return err("Cannot delete yourself")
    g.db.execute("DELETE FROM users WHERE id=?", (user_id,))
    return ok(message="deleted")


# ── AUTH (Screens 1, 2, Profile) ──────────────────────────────

@app.route("/api/auth/register", methods=["POST"])
def register():
    """Screen 2 – Register new user."""
    b = request.get_json(silent=True) or {}
    for f in ("name", "email", "password"):
        if not b.get(f):
            return err(f"{f} is required")
    exists = g.db.execute("SELECT id FROM users WHERE email=?", (b["email"],)).fetchone()
    if exists:
        return err("Email already registered")
    cur = g.db.execute(
        """INSERT INTO users
           (first_name,last_name,name,email,password_hash,
            phone,city,country,bio,photo_url,language,role,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (b.get("first_name",""), b.get("last_name",""),
         b["name"], b["email"], password_hash(b["password"]),
         b.get("phone",""), b.get("city",""), b.get("country",""),
         b.get("bio",""), b.get("photo_url",""),
         b.get("language","English"), "user", now())
    )
    user = one(g.db.execute("SELECT * FROM users WHERE id=?", (cur.lastrowid,)).fetchone())
    token = secrets.token_urlsafe(32)
    g.db.execute("INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)",
                 (token, user["id"], now()))
    user.pop("password_hash", None)
    return ok(token=token, user=user), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    """Screen 1 – Login."""
    b = request.get_json(silent=True) or {}
    if not b.get("email") or not b.get("password"):
        return err("email and password required")
    user = one(g.db.execute("SELECT * FROM users WHERE email=?", (b["email"],)).fetchone())
    if not user or not password_ok(b["password"], user["password_hash"]):
        return err("Invalid email or password", 401)
    token = secrets.token_urlsafe(32)
    g.db.execute("INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)",
                 (token, user["id"], now()))
    user.pop("password_hash", None)
    return ok(token=token, user=user)


@app.route("/api/auth/logout", methods=["POST"])

def logout():
    token = request.headers.get("X-Token","")
    g.db.execute("DELETE FROM sessions WHERE token=?", (token,))
    return ok(message="logged out")


@app.route("/api/auth/me")

def get_me():
    user = dict(g.user)
    user.pop("password_hash", None)
    return ok(user=user)


@app.route("/api/auth/me", methods=["PUT"])

def update_me():
    b = request.get_json(silent=True) or {}
    u = g.user
    g.db.execute(
        """UPDATE users SET first_name=?,last_name=?,name=?,phone=?,
           city=?,country=?,bio=?,photo_url=?,language=? WHERE id=?""",
        (b.get("first_name", u["first_name"]), b.get("last_name", u["last_name"]),
         b.get("name", u["name"]), b.get("phone", u["phone"]),
         b.get("city", u["city"]), b.get("country", u["country"]),
         b.get("bio", u["bio"]), b.get("photo_url", u["photo_url"]),
         b.get("language", u["language"]), u["id"])
    )
    user = one(g.db.execute("SELECT * FROM users WHERE id=?", (u["id"],)).fetchone())
    user.pop("password_hash", None)
    return ok(user=user)


@app.route("/api/auth/me", methods=["DELETE"])

def delete_me():
    g.db.execute("DELETE FROM users WHERE id=?", (g.user["id"],))
    return ok(message="account deleted")


# ── PRIVATE HELPERS ───────────────────────────────────────────

def _load_stops(trip_id: int) -> list[dict]:
    """Load stops with city info and planned activities nested."""
    stop_rows = rows(g.db.execute(
        """SELECT s.*, c.name as city_name, c.country, c.image_url as city_image,
                  c.cost_index, c.avg_hotel_cost, c.avg_meal_cost
           FROM stops s JOIN cities c ON c.id=s.city_id
           WHERE s.trip_id=? ORDER BY s.sort_order""",
        (trip_id,)
    ))
    for stop in stop_rows:
        stop["activities"] = _load_planned(stop["id"])
    return stop_rows


def _load_stop(stop_id: int) -> dict | None:
    """Load a single stop with activities."""
    stop = one(g.db.execute(
        """SELECT s.*, c.name as city_name, c.country, c.image_url as city_image
           FROM stops s JOIN cities c ON c.id=s.city_id WHERE s.id=?""",
        (stop_id,)
    ).fetchone())
    if stop:
        stop["activities"] = _load_planned(stop_id)
    return stop


def _load_planned(stop_id: int) -> list[dict]:
    """Load planned activities with activity detail joined."""
    return rows(g.db.execute(
        """SELECT pa.*, a.name, a.category, a.cost, a.duration_hours,
                  a.image_url, a.description
           FROM planned_activities pa
           JOIN activities a ON a.id=pa.activity_id
           WHERE pa.stop_id=? ORDER BY pa.activity_date, pa.start_time""",
        (stop_id,)
    ))
# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8082, reload=True)