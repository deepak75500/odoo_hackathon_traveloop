from __future__ import annotations

import hashlib
import secrets
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parent / "traveloop.sqlite3"


def now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def one(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


def password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 120_000)
    return f"pbkdf2_sha256$120000${salt}${digest.hex()}"


def password_ok(password: str, stored: str) -> bool:
    try:
        alg, rounds, salt, expected = stored.split("$", 3)
        if alg != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
        return secrets.compare_digest(digest.hex(), expected)
    except ValueError:
        return False


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  photo_url TEXT DEFAULT '',
  language TEXT DEFAULT 'English',
  role TEXT DEFAULT 'user',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  cover_photo TEXT DEFAULT '',
  budget_limit REAL DEFAULT 0,
  is_public INTEGER DEFAULT 0,
  public_token TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT NOT NULL,
  cost_index REAL NOT NULL,
  popularity INTEGER NOT NULL,
  avg_hotel_cost REAL NOT NULL,
  avg_meal_cost REAL NOT NULL,
  image_url TEXT DEFAULT '',
  description TEXT DEFAULT '',
  UNIQUE(name, country)
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  cost REAL NOT NULL,
  duration_hours REAL NOT NULL,
  image_url TEXT DEFAULT '',
  description TEXT DEFAULT '',
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
  UNIQUE(city_id, name)
);

CREATE TABLE IF NOT EXISTS stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  city_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  transport_cost REAL DEFAULT 0,
  notes TEXT DEFAULT '',
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (city_id) REFERENCES cities(id)
);

CREATE TABLE IF NOT EXISTS planned_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stop_id INTEGER NOT NULL,
  activity_id INTEGER NOT NULL,
  activity_date TEXT NOT NULL,
  start_time TEXT DEFAULT '09:00',
  custom_cost REAL,
  notes TEXT DEFAULT '',
  FOREIGN KEY (stop_id) REFERENCES stops(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_id) REFERENCES activities(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  amount REAL NOT NULL,
  expense_date TEXT DEFAULT '',
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  is_packed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  stop_id INTEGER,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  note_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (stop_id) REFERENCES stops(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS saved_destinations (
  user_id INTEGER NOT NULL,
  city_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, city_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_likes (
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
"""


CITIES = [
    ("Paris", "France", "Europe", 82, 96, 185, 38, "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80", "Art, cafes, river walks, museums, and timeless neighborhoods."),
    ("Tokyo", "Japan", "Asia", 78, 98, 160, 32, "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=80", "Neon districts, shrines, food craft, and world-class transit."),
    ("New York", "United States", "North America", 91, 95, 240, 45, "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=1200&q=80", "Museums, skyline views, parks, theater, and deep neighborhood variety."),
    ("Rome", "Italy", "Europe", 74, 91, 150, 34, "https://images.unsplash.com/photo-1529260830199-42c24126f198?auto=format&fit=crop&w=1200&q=80", "Ancient sites, piazzas, trattorias, and layered street life."),
    ("Bali", "Indonesia", "Asia", 46, 89, 90, 18, "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80", "Rice terraces, beaches, temples, surf, and wellness stays."),
    ("Dubai", "United Arab Emirates", "Middle East", 83, 87, 210, 42, "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80", "Architecture, desert trips, souks, beaches, and polished hotels."),
    ("Cape Town", "South Africa", "Africa", 58, 84, 120, 24, "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?auto=format&fit=crop&w=1200&q=80", "Mountain trails, coast roads, wine country, and historic sites."),
    ("Barcelona", "Spain", "Europe", 70, 90, 145, 30, "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=1200&q=80", "Markets, beaches, modernist landmarks, and late dinners."),
    ("Kyoto", "Japan", "Asia", 68, 86, 135, 28, "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80", "Temple paths, tea houses, gardens, and traditional craft streets."),
    ("Sydney", "Australia", "Oceania", 85, 82, 195, 40, "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=1200&q=80", "Harbor views, surf beaches, coastal walks, and outdoor dining."),
]

ACTIVITIES = {
    "Paris": [("Eiffel Tower Sunset Walk", "Sightseeing", 32, 2), ("Louvre Highlights", "Culture", 54, 3), ("Montmartre Food Crawl", "Food", 72, 3.5)],
    "Tokyo": [("Shibuya Night Walk", "Sightseeing", 24, 2), ("Sushi Workshop", "Food", 96, 2.5), ("Meiji Shrine Morning", "Culture", 18, 1.5)],
    "New York": [("Central Park Bike Loop", "Adventure", 38, 2), ("Broadway Evening", "Entertainment", 145, 3), ("Met Museum Tour", "Culture", 42, 2.5)],
    "Rome": [("Colosseum Underground", "Culture", 82, 3), ("Trastevere Dinner Trail", "Food", 64, 3), ("Vatican Morning", "Sightseeing", 68, 3.5)],
    "Bali": [("Ubud Rice Terrace", "Sightseeing", 22, 2), ("Sunset Surf Lesson", "Adventure", 44, 2), ("Temple Water Blessing", "Culture", 28, 1.5)],
    "Dubai": [("Desert Safari", "Adventure", 118, 6), ("Burj Khalifa Deck", "Sightseeing", 72, 1.5), ("Old Dubai Souk Walk", "Culture", 26, 2)],
    "Cape Town": [("Table Mountain Cableway", "Adventure", 34, 2.5), ("Cape Winelands Day", "Food", 92, 6.5), ("Robben Island Tour", "Culture", 48, 4)],
    "Barcelona": [("Gaudi Architecture Walk", "Culture", 46, 3), ("Tapas Market Tour", "Food", 58, 2.5), ("Beach Bike Ride", "Adventure", 26, 2)],
    "Kyoto": [("Fushimi Inari Dawn", "Sightseeing", 16, 2), ("Tea Ceremony", "Culture", 48, 1.5), ("Bamboo Grove Walk", "Sightseeing", 20, 2)],
    "Sydney": [("Harbour Kayak", "Adventure", 76, 2.5), ("Opera House Tour", "Culture", 36, 1), ("Bondi Coastal Walk", "Sightseeing", 12, 2)],
}


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        seed(conn)

def seed(conn: sqlite3.Connection) -> None:
    for city in CITIES:
        conn.execute(
            """
            INSERT OR IGNORE INTO cities
            (name,country,region,cost_index,popularity,avg_hotel_cost,avg_meal_cost,image_url,description)
            VALUES (?,?,?,?,?,?,?,?,?)
            """,
            city,
        )
    city_ids = {row["name"]: row["id"] for row in conn.execute("SELECT id,name FROM cities")}
    for city_name, items in ACTIVITIES.items():
        for name, category, cost, hours in items:
            conn.execute(
                """
                INSERT OR IGNORE INTO activities
                (city_id,name,category,cost,duration_hours,image_url,description)
                VALUES (?,?,?,?,?,?,?)
                """,
                (
                    city_ids[city_name],
                    name,
                    category,
                    cost,
                    hours,
                    f"https://source.unsplash.com/900x600/?{city_name},{category},travel",
                    f"{category} experience in {city_name} planned for travelers.",
                ),
            )

    demo = conn.execute("SELECT id FROM users WHERE email='demo@traveloop.test'").fetchone()
    if demo:
        return

    created = now()
    cur = conn.execute(
        """
        INSERT INTO users
        (first_name,last_name,name,email,password_hash,phone,city,country,bio,photo_url,language,role,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            "Demo",
            "Traveler",
            "Demo Traveler",
            "demo@traveloop.test",
            password_hash("password123"),
            "+1 555 0100",
            "Bengaluru",
            "India",
            "Loves compact city loops, local food, and clean budget plans.",
            "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80",
            "English",
            "admin",
            created,
        ),
    )
    user_id = cur.lastrowid

    trip_id = conn.execute(
        """
        INSERT INTO trips
        (user_id,name,description,start_date,end_date,cover_photo,budget_limit,is_public,public_token,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            user_id,
            "Spring Europe Loop",
            "A compact art, food, and city-walk route through Paris, Rome, and Barcelona.",
            "2026-06-12",
            "2026-06-22",
            "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1200&q=80",
            3600,
            1,
            "spring-europe-loop",
            created,
            created,
        ),
    ).lastrowid

    stops = [
        ("Paris", "2026-06-12", "2026-06-15", 1, 420, "Keep the first day light and walkable."),
        ("Rome", "2026-06-15", "2026-06-18", 2, 180, "Book popular sites early morning."),
        ("Barcelona", "2026-06-18", "2026-06-22", 3, 140, "Balance architecture and beach time."),
    ]
    stop_ids: dict[str, int] = {}
    for city, start, end, order, transport, notes in stops:
        stop_ids[city] = conn.execute(
            "INSERT INTO stops (trip_id,city_id,start_date,end_date,sort_order,transport_cost,notes) VALUES (?,?,?,?,?,?,?)",
            (trip_id, city_ids[city], start, end, order, transport, notes),
        ).lastrowid

    planned = [
        ("Paris", "Eiffel Tower Sunset Walk", "2026-06-12", "17:30"),
        ("Paris", "Louvre Highlights", "2026-06-13", "09:30"),
        ("Rome", "Colosseum Underground", "2026-06-16", "10:00"),
        ("Rome", "Trastevere Dinner Trail", "2026-06-17", "18:30"),
        ("Barcelona", "Gaudi Architecture Walk", "2026-06-19", "10:00"),
        ("Barcelona", "Tapas Market Tour", "2026-06-20", "18:00"),
    ]
    for city, activity, day, time in planned:
        activity_id = conn.execute(
            "SELECT a.id FROM activities a JOIN cities c ON c.id=a.city_id WHERE c.name=? AND a.name=?",
            (city, activity),
        ).fetchone()["id"]
        conn.execute(
            "INSERT INTO planned_activities (stop_id,activity_id,activity_date,start_time) VALUES (?,?,?,?)",
            (stop_ids[city], activity_id, day, time),
        )

    for row in [
        ("transport", "Round-trip flight estimate", 760, "2026-06-12"),
        ("stay", "City tax and hotel fees", 120, "2026-06-12"),
        ("extras", "Travel insurance", 85, "2026-06-01"),
    ]:
        conn.execute("INSERT INTO expenses (trip_id,category,label,amount,expense_date) VALUES (?,?,?,?,?)", (trip_id, *row))

    for label, category, packed in [
        ("Passport", "Documents", 0),
        ("Museum bookings", "Documents", 1),
        ("Universal adapter", "Electronics", 0),
        ("Walking shoes", "Clothing", 0),
    ]:
        conn.execute(
            "INSERT INTO checklist_items (trip_id,label,category,is_packed,created_at) VALUES (?,?,?,?,?)",
            (trip_id, label, category, packed, now()),
        )

    conn.execute(
        "INSERT INTO notes (trip_id,title,body,note_date,created_at) VALUES (?,?,?,?,?)",
        (trip_id, "Hotel arrival", "Paris check-in starts at 15:00. Store bags if early.", "2026-06-12", now()),
    )

    for city in ["Paris", "Tokyo", "Bali", "Barcelona"]:
        conn.execute(
            "INSERT OR IGNORE INTO saved_destinations (user_id,city_id,created_at) VALUES (?,?,?)",
            (user_id, city_ids[city], now()),
        )
