# Secure Software App - Main Flask Code
# Author: Sam Lucas
# Email: sam.lucas5@education.nsw.gov.au
# Date: March 16, 2025
#
# Purpose:
# Flask authentication system with secure user registration, login, password/email management,
# and session handling with bcrypt hashing
#

from flask import Flask, redirect, render_template, request, session, jsonify
from flask_bcrypt import Bcrypt
from datetime import timedelta
from dotenv import load_dotenv
import os
import secrets
import sqlite3
import logging
import uuid
import json
import base64
import threading
import time
import ssl
import random
import urllib.parse
import urllib.error
import urllib.request
import certifi

load_dotenv(override=True)

# Setup
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY") or "dev-secret-key-change-in-production"
app.permanent_session_lifetime = timedelta(minutes=20)

# Configure Logging
logging.basicConfig(
    filename="security.log",
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# Session Security
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("FLASK_ENV", "development") == "production"
)

bcrypt = Bcrypt(app)

SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_SEARCH_URL = "https://api.spotify.com/v1/search"
SPOTIFY_ALBUMS_URL = "https://api.spotify.com/v1/albums"
APP_USER_AGENT = "MusicDiaryPWA/1.0 (sam.lucas5@education.nsw.gov.au)"
_spotify_token_cache = {"access_token": None, "expires_at": 0}
_spotify_token_lock = threading.Lock()
SPOTIFY_TLS_VERIFY = os.getenv("SPOTIFY_TLS_VERIFY", "true").strip().lower() not in ("0", "false", "no")
TLS_CONTEXT = (
    ssl.create_default_context(cafile=certifi.where())
    if SPOTIFY_TLS_VERIFY
    else ssl._create_unverified_context()
)


def get_db_connection():
    """Create database connection"""
    connection = sqlite3.connect("app.db")
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    """Initialize database if it doesn't exist"""
    connection = get_db_connection()
    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            userID INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS albums (
            albumID TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            artist TEXT,
            year INTEGER,
            comment TEXT,
            spotify_album_id TEXT,
            cover_url TEXT,
            user_id INTEGER NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(userID)
        )
    """)

    cursor.execute("PRAGMA table_info(albums)")
    album_columns = {column["name"] for column in cursor.fetchall()}
    if "spotify_album_id" not in album_columns:
        cursor.execute("ALTER TABLE albums ADD COLUMN spotify_album_id TEXT")
    if "cover_url" not in album_columns:
        cursor.execute("ALTER TABLE albums ADD COLUMN cover_url TEXT")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS songs (
            songID TEXT PRIMARY KEY,
            albumID TEXT NOT NULL,
            title TEXT NOT NULL,
            rating INTEGER DEFAULT 0,
            comment TEXT,
            user_id INTEGER NOT NULL,
            FOREIGN KEY(albumID) REFERENCES albums(albumID),
            FOREIGN KEY(user_id) REFERENCES users(userID)
        )
    """)

    connection.commit()
    connection.close()
    logging.info("Database initialized")


def fetch_json_get(url, params=None, headers=None, timeout=8):
    """Execute an HTTP GET request and return JSON if successful."""
    full_url = url
    if params:
        full_url = f"{url}?{urllib.parse.urlencode(params)}"

    request_headers = {
        "User-Agent": APP_USER_AGENT,
        "Accept": "application/json"
    }
    if headers:
        request_headers.update(headers)

    req = urllib.request.Request(full_url, headers=request_headers, method="GET")

    try:
        with urllib.request.urlopen(req, timeout=timeout, context=TLS_CONTEXT) as response:
            if response.status != 200:
                return None

            response_body = response.read().decode(response.headers.get_content_charset() or "utf-8")
            return json.loads(response_body)
    except urllib.error.HTTPError as err:
        response_text = ""
        try:
            response_text = err.read().decode("utf-8", errors="ignore")[:300]
        except Exception:
            response_text = ""
        logging.warning(
            f"External API request failed for {full_url}: HTTP {err.code} {err.reason}. {response_text}"
        )
        return None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as err:
        logging.warning(f"External API request failed for {full_url}: {err}")
        return None


def fetch_json_post_form(url, form_data, headers=None, timeout=8):
    """Execute an HTTP form POST request and return JSON if successful."""
    request_headers = {
        "User-Agent": APP_USER_AGENT,
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    if headers:
        request_headers.update(headers)

    encoded_body = urllib.parse.urlencode(form_data).encode("utf-8")
    req = urllib.request.Request(url, headers=request_headers, data=encoded_body, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=timeout, context=TLS_CONTEXT) as response:
            if response.status != 200:
                return None

            response_body = response.read().decode(response.headers.get_content_charset() or "utf-8")
            return json.loads(response_body)
    except urllib.error.HTTPError as err:
        response_text = ""
        try:
            response_text = err.read().decode("utf-8", errors="ignore")[:300]
        except Exception:
            response_text = ""
        logging.warning(
            f"External API request failed for {url}: HTTP {err.code} {err.reason}. {response_text}"
        )
        return None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as err:
        logging.warning(f"External API request failed for {url}: {err}")
        return None


def release_year_from_album(album):
    release_date = album.get("release_date")
    if not isinstance(release_date, str) or len(release_date) < 4:
        return None

    year_prefix = release_date[:4]
    if not year_prefix.isdigit():
        return None
    return int(year_prefix)


def get_spotify_access_token():
    with _spotify_token_lock:
        client_id = (
            os.getenv("SPOTIFY_CLIENT_ID")
            or os.getenv("SPOTIFY_API_KEY")
            or os.getenv("SPOTIFY_KEY")
            or ""
        ).strip()
        client_secret = (
            os.getenv("SPOTIFY_CLIENT_SECRET")
            or os.getenv("SPOTIFY_API_SECRET")
            or os.getenv("SPOTIFY_SECRET")
            or ""
        ).strip()
        if client_id and client_secret:
            cached_token = _spotify_token_cache.get("access_token")
            expires_at = _spotify_token_cache.get("expires_at", 0)
            if cached_token and time.time() < (expires_at - 30):
                return cached_token

            basic_auth = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")
            token_response = fetch_json_post_form(
                SPOTIFY_TOKEN_URL,
                form_data={"grant_type": "client_credentials"},
                headers={"Authorization": f"Basic {basic_auth}"}
            )
            if not token_response:
                return None

            access_token = token_response.get("access_token")
            expires_in = token_response.get("expires_in")
            if not isinstance(access_token, str) or not access_token:
                return None

            expires_in_seconds = int(expires_in) if isinstance(expires_in, int) else 3600
            _spotify_token_cache["access_token"] = access_token
            _spotify_token_cache["expires_at"] = time.time() + max(0, expires_in_seconds)
            return access_token

        configured_access_token = (os.getenv("SPOTIFY_ACCESS_TOKEN") or "").strip()
        if configured_access_token:
            # Spotify bearer tokens are typically long JWT-like values.
            # If a short string is supplied, it's usually a client ID/API key by mistake.
            if len(configured_access_token) < 80:
                logging.warning(
                    "SPOTIFY_ACCESS_TOKEN appears invalid/too short. "
                    "Use SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET, or a real bearer access token."
                )
                return None
            return configured_access_token

        if client_id and not client_secret:
            logging.warning("Spotify client ID is configured but SPOTIFY_CLIENT_SECRET is missing")
            return None

        cached_token = _spotify_token_cache.get("access_token")
        expires_at = _spotify_token_cache.get("expires_at", 0)
        if cached_token and time.time() < (expires_at - 30):
            return cached_token

        logging.warning("Spotify credentials are not configured")
        return None


def resolve_album_metadata(title, artist):
    """Find Spotify album ID, cover art URL, and release year."""
    if not title or not artist:
        return None, None, None

    access_token = get_spotify_access_token()
    if not access_token:
        return None, None, None

    search_query = f'album:"{title}" artist:"{artist}"'
    search_response = fetch_json_get(
        SPOTIFY_SEARCH_URL,
        params={"q": search_query, "type": "album", "limit": 5},
        headers={"Authorization": f"Bearer {access_token}"}
    )
    if not search_response:
        return None, None, None

    albums = (search_response.get("albums") or {}).get("items") or []
    if not albums:
        return None, None, None

    first_album = albums[0]
    album_id = first_album.get("id")
    images = first_album.get("images") or []
    cover_url = images[0].get("url") if images and isinstance(images[0], dict) else None
    release_year = release_year_from_album(first_album)
    return album_id, cover_url, release_year


def resolve_album_metadata_async(album_id, title, artist):
    """Background task for fetching and persisting album metadata."""
    spotify_album_id, cover_url, release_year = resolve_album_metadata(title, artist)
    if spotify_album_id is None and cover_url is None and release_year is None:
        return

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(
            """
            UPDATE albums
            SET spotify_album_id = COALESCE(?, spotify_album_id),
                cover_url = COALESCE(?, cover_url),
                year = COALESCE(?, year)
            WHERE albumID = ?
            """,
            (spotify_album_id, cover_url, release_year, album_id)
        )
        connection.commit()
    except sqlite3.Error as err:
        logging.warning(f"Failed to persist metadata for album {album_id}: {err}")
    finally:
        if connection is not None:
            connection.close()


def parse_spotify_album_result(album):
    images = album.get("images") or []
    cover_url = images[0].get("url") if images and isinstance(images[0], dict) else None
    artists = album.get("artists") or []
    artist_names = [artist.get("name") for artist in artists if isinstance(artist, dict) and artist.get("name")]

    return {
        "spotify_album_id": album.get("id"),
        "title": album.get("name"),
        "artist": ", ".join(artist_names) if artist_names else "Unknown",
        "year": release_year_from_album(album),
        "cover_url": cover_url
    }


def infer_genres_from_album_context(title, artist):
    """Fallback decision-tree genre inference when Spotify genre metadata is unavailable."""
    context = f"{title or ''} {artist or ''}".lower()
    decision_rules = [
        (("fall out boy", "my chemical romance", "paramore", "panic! at the disco", "blink-182", "sum 41"), ["pop punk", "emo"]),
        (("nirvana", "pearl jam", "soundgarden", "alice in chains"), ["grunge", "alternative rock"]),
        (("metallica", "slipknot", "linkin park", "avenged sevenfold"), ["metal", "hard rock"]),
        (("drake", "kendrick", "travis scott", "j cole"), ["hip hop", "rap"]),
        (("taylor swift", "olivia rodrigo", "dua lipa", "ariana grande"), ["pop", "dance pop"]),
        (("billie eilish", "lorde", "phoebe bridgers", "the 1975"), ["indie pop", "alternative"]),
    ]

    for keywords, genres in decision_rules:
        if any(keyword in context for keyword in keywords):
            return genres

    return ["alternative rock", "indie rock", "rock"]


def get_album_recommendations(album):
    """Recommend albums using Spotify album tracks, genre signals, and release year."""
    title = album.get("title")
    artist = album.get("artist")
    spotify_album_id = album.get("spotify_album_id")
    if not title or not artist:
        return "", []

    access_token = get_spotify_access_token()
    if not access_token:
        return "", []

    headers = {"Authorization": f"Bearer {access_token}"}
    if not spotify_album_id:
        spotify_album_id, _, _ = resolve_album_metadata(title, artist)
        if not spotify_album_id:
            return "", []

    album_response = fetch_json_get(f"{SPOTIFY_ALBUMS_URL}/{spotify_album_id}", headers=headers)
    if not album_response:
        return "", []

    track_items = (album_response.get("tracks") or {}).get("items") or []
    track_titles = [track.get("name") for track in track_items if isinstance(track, dict) and isinstance(track.get("name"), str)]
    album_year = release_year_from_album(album_response) or album.get("year")
    rng = random.SystemRandom()

    inferred_genres = infer_genres_from_album_context(title, artist)
    profile_genres = list(inferred_genres[:3])

    if track_titles:
        rng.shuffle(track_titles)
        track_title_snippet = " ".join(track_titles[:2]).lower()
        if any(keyword in track_title_snippet for keyword in ("love", "heart", "stay", "down")) and "emo" not in profile_genres:
            profile_genres.insert(0, "emo")
        if any(keyword in track_title_snippet for keyword in ("summer", "dance", "party", "teen")) and "pop punk" not in profile_genres:
            profile_genres.insert(0, "pop punk")

    genre_queries = profile_genres[:]
    rng.shuffle(genre_queries)

    candidate_pool = []
    seen_candidate_albums = {spotify_album_id}

    for genre in genre_queries:
        query_parts = [f'genre:"{genre}"']
        if isinstance(album_year, int):
            lower_year = max(1970, album_year - 5)
            upper_year = album_year + 5
            query_parts.append(f"year:{lower_year}-{upper_year}")
        search_response = fetch_json_get(
            SPOTIFY_SEARCH_URL,
            params={"q": " ".join(query_parts), "type": "track", "limit": 10},
            headers=headers
        )
        if not search_response:
            continue

        tracks = (search_response.get("tracks") or {}).get("items") or []
        rng.shuffle(tracks)
        for track in tracks:
            candidate_album = track.get("album") or {}
            candidate_album_id = candidate_album.get("id")
            if not candidate_album_id or candidate_album_id in seen_candidate_albums:
                continue

            candidate_pool.append(candidate_album)
            seen_candidate_albums.add(candidate_album_id)

    if len(candidate_pool) < 4:
        fallback_queries = []
        if isinstance(album_year, int):
            fallback_queries.extend([
                f'year:{max(1970, album_year - 5)}-{album_year + 5}',
                f'year:{max(1970, album_year - 3)}-{album_year + 3}',
            ])
        fallback_queries.extend(profile_genres)
        rng.shuffle(fallback_queries)

        for query_value in fallback_queries:
            search_response = fetch_json_get(
                SPOTIFY_SEARCH_URL,
                params={"q": query_value, "type": "track", "limit": 10},
                headers=headers
            )
            if not search_response:
                continue

            tracks = (search_response.get("tracks") or {}).get("items") or []
            rng.shuffle(tracks)
            for track in tracks:
                candidate_album = track.get("album") or {}
                candidate_album_id = candidate_album.get("id")
                if not candidate_album_id or candidate_album_id in seen_candidate_albums:
                    continue

                candidate_pool.append(candidate_album)
                seen_candidate_albums.add(candidate_album_id)
                if len(candidate_pool) >= 12:
                    break
            if len(candidate_pool) >= 12:
                break

    if not candidate_pool:
        return ", ".join(profile_genres[:3]), []

    ranked_candidates = []
    seen_ranked_albums = set()
    selected_year = album_year if isinstance(album_year, int) else None

    for candidate_album in candidate_pool:
        candidate_id = candidate_album.get("id")
        if not candidate_id or candidate_id in seen_ranked_albums:
            continue

        parsed_album = parse_spotify_album_result(candidate_album)
        if not parsed_album.get("title") or not parsed_album.get("cover_url"):
            continue

        candidate_year = parsed_album.get("year")
        if isinstance(selected_year, int) and isinstance(candidate_year, int):
            year_distance = abs(candidate_year - selected_year)
        else:
            year_distance = 5

        genre_bonus = 0 if not profile_genres else (0 if candidate_album.get("album_type") == "compilation" else -0.3)
        same_artist_penalty = 0.8 if parsed_album.get("artist", "").lower() == artist.lower() else 0.0
        jitter = rng.uniform(0, 0.85)
        score = year_distance + genre_bonus + same_artist_penalty + jitter

        ranked_candidates.append((score, parsed_album))
        seen_ranked_albums.add(candidate_id)

    ranked_candidates.sort(key=lambda entry: entry[0])

    recommendations = []
    for _, parsed_album in ranked_candidates:
        recommendations.append(parsed_album)
        if len(recommendations) >= 4:
            break

    return ", ".join(profile_genres[:3]), recommendations[:4]


@app.before_request
def before_request():
    session.permanent = True


def validate_password(password):
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    if not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter"
    if not any(c.islower() for c in password):
        return False, "Password must contain at least one lowercase letter"
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number"
    return True, "Password is valid"


def validate_username(username):
    """
    Validate username meets requirements:
    - At least 3 characters
    - Only uppercase and lowercase letters
    """
    if len(username) < 3:
        return False, "Username must be at least 3 characters"
    if not username.isalpha():
        return False, "Username can only contain letters (A-Z, a-z)"
    return True, "Username is valid"


def json_response(success, message, data=None, status=200):
    payload = {"success": success, "message": message}
    if data is not None:
        payload["data"] = data
    return jsonify(payload), status


def require_login():
    user_id = session.get("user_id")
    if user_id is None:
        return None, json_response(False, "Authentication required", None, 401)
    return user_id, None


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/home")
def home_dashboard():
    if "user_id" not in session:
        return redirect("/")
    return render_template("home.html")


@app.route("/albums")
def albums_page():
    if "user_id" not in session:
        return redirect("/")
    return render_template("albums.html")


@app.route("/album-detail")
def album_detail_page():
    if "user_id" not in session:
        return redirect("/")
    return render_template("album-detail.html")


@app.route("/api/register", methods=["POST"])
def register():
    # Prefer form submissions (browser) but accept JSON for API clients
    if request.form:
        payload = request.form.to_dict()
        is_api = False
    else:
        payload = request.get_json(silent=True) or {}
        is_api = request.headers.get('Content-Type', '').lower().startswith('application/json') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'

    def respond(success, message, data=None, status=200):
        if success and data and "userID" in data:
            # Always set session on successful registration/login
            session["user_id"] = int(data.get("userID"))
            session.permanent = True
        
        if is_api:
            return json_response(success, message, data, status)
        else:
            encoded = urllib.parse.quote_plus(message)
            if success:
                # On success redirect to dashboard
                return redirect("/home")
            else:
                # On failure redirect back to signup page with error in query string
                return redirect(f"/?error={encoded}")

    username = payload.get("username", "")
    email = payload.get("email", "")
    password = payload.get("password", "")
    confirm_password = payload.get("confirm_password", "")

    if not isinstance(username, str) or not isinstance(email, str) or not isinstance(password, str) or not isinstance(confirm_password, str):
        return respond(False, "All fields must be strings", None, 400)

    username = username.strip()
    email = email.strip()
    password = password.strip()
    confirm_password = confirm_password.strip()

    if not username or not email or not password or not confirm_password:
        return respond(False, "All fields are required", None, 400)

    is_valid, message = validate_username(username)
    if not is_valid:
        return respond(False, message, None, 400)

    is_valid, message = validate_password(password)
    if not is_valid:
        return respond(False, message, None, 400)

    if password != confirm_password:
        return respond(False, "Passwords do not match", None, 400)

    if "@" not in email or "." not in email:
        return respond(False, "Invalid email format", None, 400)

    hashed_password = bcrypt.generate_password_hash(password).decode("utf-8")

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
            (username, email, hashed_password)
        )
        connection.commit()
        user_id = cursor.lastrowid
        connection.close()

        logging.info(f"User registered: {repr(username)}")
        return respond(True, "Registration successful", {"userID": str(user_id)}, 201)
    except sqlite3.IntegrityError:
        logging.warning(f"Registration failed - duplicate: {repr(username)}")
        return respond(False, "Username or email already exists", None, 400)
    except Exception as e:
        logging.error(f"Registration error: {e}")
        return respond(False, "An error occurred during registration", None, 500)


@app.route("/api/login", methods=["POST"])
def login():
    # Support both form submissions and JSON API calls
    if request.form:
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()
        is_api = False
    else:
        payload = request.get_json(silent=True) or {}
        username = payload.get("username", "").strip()
        password = payload.get("password", "").strip()
        is_api = request.headers.get('Content-Type', '').lower().startswith('application/json') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'

    if not isinstance(username, str) or not isinstance(password, str):
        if is_api:
            return json_response(False, "Username and password must be strings", None, 400)
        else:
            return redirect("/")

    if not username or not password:
        if is_api:
            return json_response(False, "Username and password are required", None, 400)
        else:
            return redirect("/")

    logging.info(f"Login attempt: {repr(username)}")

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        user = cursor.fetchone()
        connection.close()

        if user and bcrypt.check_password_hash(user["password"], password):
            session["user_id"] = int(user["userID"])
            session.permanent = True
            logging.info(f"Login successful: {repr(username)}")
            if is_api:
                return json_response(True, "Login successful", {"userID": str(user["userID"]), "username": user["username"]}, 200)
            else:
                return redirect("/home")

        logging.warning(f"Login failed: {repr(username)}")
        if is_api:
            return json_response(False, "Invalid username or password", None, 401)
        else:
            return redirect("/")
    except Exception as e:
        logging.error(f"Login error: {e}")
        if is_api:
            return json_response(False, "An error occurred during login", None, 500)
        else:
            return redirect("/")


@app.route("/api/logout", methods=["GET", "POST"])
def logout():
    if "user_id" in session:
        logging.info(f"User logged out: {session['user_id']}")
    session.clear()
    return redirect("/")


@app.route("/api/change-password", methods=["POST"])
def change_password():
    """Change user password"""
    user_id, auth_error = require_login()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or {}
    old_password = payload.get("old_password", "")
    new_password = payload.get("new_password", "")
    confirm_password = payload.get("confirm_password", "")

    if not isinstance(old_password, str) or not isinstance(new_password, str) or not isinstance(confirm_password, str):
        return json_response(False, "All fields must be strings", None, 400)

    old_password = old_password.strip()
    new_password = new_password.strip()
    confirm_password = confirm_password.strip()

    if not old_password or not new_password or not confirm_password:
        return json_response(False, "All fields are required", None, 400)

    is_valid, message = validate_password(new_password)
    if not is_valid:
        return json_response(False, message, None, 400)

    if new_password != confirm_password:
        return json_response(False, "New passwords do not match", None, 400)

    if old_password == new_password:
        return json_response(False, "New password must be different from old password", None, 400)

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT password FROM users WHERE userID = ?", (user_id,))
        user = cursor.fetchone()

        if not user or not bcrypt.check_password_hash(user["password"], old_password):
            logging.warning(f"Password change failed - invalid old password: {user_id}")
            connection.close()
            return json_response(False, "Current password is incorrect", None, 401)

        hashed_password = bcrypt.generate_password_hash(new_password).decode("utf-8")
        cursor.execute(
            "UPDATE users SET password = ? WHERE userID = ?",
            (hashed_password, user_id)
        )
        connection.commit()
        connection.close()

        logging.info(f"Password changed for user: {user_id}")
        return json_response(True, "Password changed successfully!", None, 200)

    except Exception as e:
        logging.error(f"Change password error: {e}")
        return json_response(False, "An error occurred while changing password", None, 500)


@app.route("/api/change-email", methods=["POST"])
def change_email():
    user_id, auth_error = require_login()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or {}
    password = payload.get("password", "")
    new_email = payload.get("new_email", "")

    if not isinstance(password, str) or not isinstance(new_email, str):
        return json_response(False, "All fields must be strings", None, 400)

    password = password.strip()
    new_email = new_email.strip()

    if not password or not new_email:
        return json_response(False, "All fields are required", None, 400)

    if "@" not in new_email or "." not in new_email:
        return json_response(False, "Invalid email format", None, 400)

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT password, email FROM users WHERE userID = ?", (user_id,))
        user = cursor.fetchone()

        if not user or not bcrypt.check_password_hash(user["password"], password):
            logging.warning(f"Email change failed - invalid password: {user_id}")
            connection.close()
            return json_response(False, "Password is incorrect", None, 401)

        if user["email"] == new_email:
            connection.close()
            return json_response(False, "New email must be different from current email", None, 400)

        cursor.execute(
            "UPDATE users SET email = ? WHERE userID = ?",
            (new_email, user_id)
        )
        connection.commit()
        connection.close()

        logging.info(f"Email changed for user: {user_id}")
        return json_response(True, "Email changed successfully!", None, 200)

    except sqlite3.IntegrityError:
        logging.warning(f"Email change failed - duplicate email: {user_id}")
        return json_response(False, "Email already in use", None, 400)
    except Exception as e:
        logging.error(f"Change email error: {e}")
        return json_response(False, "An error occurred while changing email", None, 500)


@app.route("/api/albums", methods=["GET"])
def list_albums():
    user_id, auth_error = require_login()
    if auth_error:
        return auth_error

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM albums WHERE user_id = ? ORDER BY title", (user_id,))
    albums = [dict(row) for row in cursor.fetchall()]
    connection.close()
    return json_response(True, "Albums retrieved", {"albums": albums}, 200)


@app.route("/api/albums", methods=["POST"])
def create_album():
    user_id, auth_error = require_login()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or {}
    title = payload.get("title", "")
    artist = payload.get("artist")
    comment = payload.get("comment", "")

    if not isinstance(title, str):
        return json_response(False, "Album title is required", None, 400)

    title = title.strip()
    if not title:
        return json_response(False, "Album title is required", None, 400)

    if artist is not None and not isinstance(artist, str):
        return json_response(False, "Artist must be a string", None, 400)
    if isinstance(artist, str):
        artist = artist.strip()
        if not artist:
            artist = None

    album_id = str(uuid.uuid4())
    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute(
        "INSERT INTO albums (albumID, title, artist, year, comment, spotify_album_id, cover_url, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (album_id, title, artist, None, comment, None, None, user_id)
    )
    connection.commit()
    connection.close()

    if artist:
        metadata_thread = threading.Thread(
            target=resolve_album_metadata_async,
            args=(album_id, title, artist),
            daemon=True
        )
        metadata_thread.start()

    return json_response(True, "Album created", {"album": {
        "albumID": album_id,
        "title": title,
        "artist": artist,
        "year": None,
        "comment": comment,
        "spotify_album_id": None,
        "cover_url": None,
        "metadata_status": "pending" if artist else "skipped",
        "user_id": user_id
    }}, 201)


@app.route("/api/albums/<album_id>", methods=["GET"])
def get_album(album_id):
    user_id, auth_error = require_login()
    if auth_error:
        return auth_error

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM albums WHERE albumID = ?", (album_id,))
    album = cursor.fetchone()
    connection.close()

    if not album:
        return json_response(False, "Album not found", None, 404)
    if album["user_id"] != user_id:
        return json_response(False, "Forbidden", None, 403)

    return json_response(True, "Album retrieved", {"album": dict(album)}, 200)


@app.route("/api/albums/<album_id>/recommendations", methods=["GET"])
def get_album_recommendations_api(album_id):
    user_id, auth_error = require_login()
    if auth_error:
        return auth_error

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM albums WHERE albumID = ?", (album_id,))
    album = cursor.fetchone()
    connection.close()

    if not album:
        return json_response(False, "Album not found", None, 404)
    if album["user_id"] != user_id:
        return json_response(False, "Forbidden", None, 403)

    profile_label, recommendations = get_album_recommendations(dict(album))
    return json_response(
        True,
        "Album recommendations retrieved",
        {"profile": profile_label, "recommendations": recommendations},
        200
    )


@app.route("/api/albums/<album_id>", methods=["PUT"])
def update_album(album_id):
    user_id, auth_error = require_login()
    if auth_error:
        return auth_error

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM albums WHERE albumID = ?", (album_id,))
    album = cursor.fetchone()
    if not album:
        connection.close()
        return json_response(False, "Album not found", None, 404)
    if album["user_id"] != user_id:
        connection.close()
        return json_response(False, "Forbidden", None, 403)

    payload = request.get_json(silent=True) or {}
    title = payload.get("title")
    artist = payload.get("artist")
    year = payload.get("year")

    if title is not None:
        if not isinstance(title, str):
            connection.close()
            return json_response(False, "Title must be a string", None, 400)
        title = title.strip()
        if not title:
            connection.close()
            return json_response(False, "Title cannot be empty", None, 400)

    if artist is not None and not isinstance(artist, str):
        connection.close()
        return json_response(False, "Artist must be a string", None, 400)

    if year is not None and (not isinstance(year, int) or isinstance(year, bool)):
        connection.close()
        return json_response(False, "Year must be an integer", None, 400)

    if title is None and artist is None and year is None:
        connection.close()
        return json_response(False, "No valid fields provided", None, 400)

    fields = []
    values = []
    if title is not None:
        fields.append("title = ?")
        values.append(title)
    if artist is not None:
        fields.append("artist = ?")
        values.append(artist)
    if year is not None:
        fields.append("year = ?")
        values.append(year)

    values.append(album_id)
    cursor.execute(f"UPDATE albums SET {', '.join(fields)} WHERE albumID = ?", values)
    connection.commit()
    connection.close()
    return json_response(True, "Album updated", None, 200)


@app.route("/api/albums/<album_id>", methods=["DELETE"])
def delete_album(album_id):
    user_id, auth_error = require_login()
    if auth_error:
        return auth_error

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM albums WHERE albumID = ?", (album_id,))
    album = cursor.fetchone()
    if not album:
        connection.close()
        return json_response(False, "Album not found", None, 404)
    if album["user_id"] != user_id:
        connection.close()
        return json_response(False, "Forbidden", None, 403)

    cursor.execute("DELETE FROM songs WHERE albumID = ? AND user_id = ?", (album_id, user_id))
    cursor.execute("DELETE FROM albums WHERE albumID = ? AND user_id = ?", (album_id, user_id))
    connection.commit()
    connection.close()
    return json_response(True, "Album deleted", None, 200)


@app.route("/api/albums/<album_id>/songs", methods=["GET"])
def list_album_songs(album_id):
    user_id, auth_error = require_login()
    if auth_error:
        return auth_error

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM albums WHERE albumID = ?", (album_id,))
    album = cursor.fetchone()
    if not album:
        connection.close()
        return json_response(False, "Album not found", None, 404)
    if album["user_id"] != user_id:
        connection.close()
        return json_response(False, "Forbidden", None, 403)

    cursor.execute("SELECT * FROM songs WHERE albumID = ? AND user_id = ? ORDER BY title", (album_id, user_id))
    songs = [dict(row) for row in cursor.fetchall()]
    connection.close()
    return json_response(True, "Songs retrieved", {"songs": songs}, 200)


@app.route("/api/albums/<album_id>/songs", methods=["POST"])
def create_song(album_id):
    user_id, auth_error = require_login()
    if auth_error:
        return auth_error

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM albums WHERE albumID = ?", (album_id,))
    album = cursor.fetchone()
    if not album:
        connection.close()
        return json_response(False, "Album not found", None, 404)
    if album["user_id"] != user_id:
        connection.close()
        return json_response(False, "Forbidden", None, 403)

    payload = request.get_json(silent=True) or {}
    title = payload.get("title", "")
    rating = payload.get("rating")
    comment = payload.get("comment", "")

    if not isinstance(title, str):
        connection.close()
        return json_response(False, "Song title is required", None, 400)

    title = title.strip()
    if not title:
        connection.close()
        return json_response(False, "Song title is required", None, 400)

    if rating is not None and (not isinstance(rating, int) or rating < 0 or rating > 5):
        connection.close()
        return json_response(False, "Rating must be between 0 and 5", None, 400)

    song_id = str(uuid.uuid4())
    cursor.execute(
        "INSERT INTO songs (songID, albumID, title, rating, comment, user_id) VALUES (?, ?, ?, ?, ?, ?)",
        (song_id, album_id, title, rating or 0, comment, user_id)
    )
    connection.commit()
    connection.close()

    return json_response(True, "Song created", {"song": {
        "songID": song_id,
        "albumID": album_id,
        "title": title,
        "rating": rating or 0,
        "comment": comment,
        "user_id": user_id
    }}, 201)


@app.route("/api/songs/<song_id>", methods=["GET"])
def get_song(song_id):
    user_id, auth_error = require_login()
    if auth_error:
        return auth_error

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM songs WHERE songID = ?", (song_id,))
    song = cursor.fetchone()
    connection.close()

    if not song:
        return json_response(False, "Song not found", None, 404)

    if song["user_id"] != user_id:
        return json_response(False, "Forbidden", None, 403)

    return json_response(True, "Song retrieved", {"song": dict(song)}, 200)


@app.route("/api/songs/<song_id>", methods=["PUT"])
def update_song(song_id):
    user_id, auth_error = require_login()
    if auth_error:
        return auth_error

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM songs WHERE songID = ?", (song_id,))
    song = cursor.fetchone()
    if not song:
        connection.close()
        return json_response(False, "Song not found", None, 404)
    if song["user_id"] != user_id:
        connection.close()
        return json_response(False, "Forbidden", None, 403)

    payload = request.get_json(silent=True) or {}
    title = payload.get("title")
    track = payload.get("track")
    length = payload.get("length")

    if title is not None:
        if not isinstance(title, str):
            connection.close()
            return json_response(False, "Title must be a string", None, 400)
        title = title.strip()
        if not title:
            connection.close()
            return json_response(False, "Title cannot be empty", None, 400)

    if track is not None and (not isinstance(track, int) or isinstance(track, bool)):
        connection.close()
        return json_response(False, "Track must be an integer", None, 400)

    if length is not None and (not isinstance(length, int) or isinstance(length, bool)):
        connection.close()
        return json_response(False, "Length must be an integer", None, 400)

    if title is None and track is None and length is None:
        connection.close()
        return json_response(False, "No valid fields provided", None, 400)

    fields = []
    values = []
    if title is not None:
        fields.append("title = ?")
        values.append(title)
    if track is not None:
        fields.append("track = ?")
        values.append(track)
    if length is not None:
        fields.append("length = ?")
        values.append(length)

    values.append(song_id)
    cursor.execute(f"UPDATE songs SET {', '.join(fields)} WHERE songID = ?", values)
    connection.commit()
    connection.close()
    return json_response(True, "Song updated", None, 200)


@app.route("/api/songs/<song_id>", methods=["DELETE"])
def delete_song(song_id):
    user_id, auth_error = require_login()
    if auth_error:
        return auth_error

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM songs WHERE songID = ?", (song_id,))
    song = cursor.fetchone()
    if not song:
        connection.close()
        return json_response(False, "Song not found", None, 404)
    if song["user_id"] != user_id:
        connection.close()
        return json_response(False, "Forbidden", None, 403)

    cursor.execute("DELETE FROM songs WHERE songID = ? AND user_id = ?", (song_id, user_id))
    connection.commit()
    connection.close()
    return json_response(True, "Song deleted", None, 200)


@app.route("/add-sample")
def add_sample():
    connection = get_db_connection()
    cursor = connection.cursor()

    samples = [
        ("Sammy", "sammy@gmail.com", bcrypt.generate_password_hash("password123").decode("utf-8")),
        ("Alice", "alice@gmail.com", bcrypt.generate_password_hash("password123").decode("utf-8")),
    ]

    try:
        cursor.executemany(
            "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
            samples
        )
        connection.commit()
    except sqlite3.IntegrityError:
        pass
    finally:
        connection.close()

    return "Sample data added"


init_db()


if __name__ == "__main__":
    logging.info("Flask application started")
    app.run(debug=os.getenv("FLASK_DEBUG", "False").lower() == "true", port=5002)
