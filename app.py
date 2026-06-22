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
import urllib.parse

# Setup
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(16))
app.permanent_session_lifetime = timedelta(minutes=20)
load_dotenv()

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
            user_id TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(userID)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS songs (
            songID TEXT PRIMARY KEY,
            albumID TEXT NOT NULL,
            title TEXT NOT NULL,
            track INTEGER,
            length INTEGER,
            user_id TEXT NOT NULL,
            FOREIGN KEY(albumID) REFERENCES albums(albumID),
            FOREIGN KEY(user_id) REFERENCES users(userID)
        )
    """)

    connection.commit()
    connection.close()
    logging.info("Database initialized")


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
    return str(user_id), None


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/home")
def home_dashboard():
    if "user_id" not in session:
        return redirect("/")
    return render_template("home.html")


@app.route("/api/register", methods=["POST"])
def register():
    # Accept both JSON and traditional form submissions (browsers may POST form data)
    payload = request.get_json(silent=True)
    if not payload:
        # request.get_json returns None when there's no JSON body
        payload = request.form.to_dict() if request.form else {}

    def respond(success, message, data=None, status=200):
        # Return JSON for API/XHR calls, otherwise redirect back to UI
        if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return json_response(success, message, data, status)
        else:
            encoded = urllib.parse.quote_plus(message)
            if success:
                # On success redirect to dashboard
                session["user_id"] = data.get("userID") if data else session.get("user_id")
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
    payload = request.get_json(silent=True) or {}

    username = payload.get("username", "")
    password = payload.get("password", "")

    if not isinstance(username, str) or not isinstance(password, str):
        return json_response(False, "Username and password must be strings", None, 400)

    username = username.strip()
    password = password.strip()

    if not username or not password:
        return json_response(False, "Username and password are required", None, 400)

    logging.info(f"Login attempt: {repr(username)}")

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        user = cursor.fetchone()
        connection.close()

        if user and bcrypt.check_password_hash(user["password"], password):
            session["user_id"] = str(user["userID"])
            logging.info(f"Login successful: {repr(username)}")
            return json_response(True, "Login successful", {"userID": str(user["userID"]), "username": user["username"]}, 200)

        logging.warning(f"Login failed: {repr(username)}")
        return json_response(False, "Invalid username or password", None, 401)
    except Exception as e:
        logging.error(f"Login error: {e}")
        return json_response(False, "An error occurred during login", None, 500)


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
    year = payload.get("year")

    if not isinstance(title, str):
        return json_response(False, "Album title is required", None, 400)

    title = title.strip()
    if not title:
        return json_response(False, "Album title is required", None, 400)

    if artist is not None and not isinstance(artist, str):
        return json_response(False, "Artist must be a string", None, 400)

    if year is not None and (not isinstance(year, int) or isinstance(year, bool)):
        return json_response(False, "Year must be an integer", None, 400)

    album_id = str(uuid.uuid4())
    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute(
        "INSERT INTO albums (albumID, title, artist, year, user_id) VALUES (?, ?, ?, ?, ?)",
        (album_id, title, artist, year, user_id)
    )
    connection.commit()
    connection.close()

    return json_response(True, "Album created", {"album": {
        "albumID": album_id,
        "title": title,
        "artist": artist,
        "year": year,
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

    cursor.execute("SELECT * FROM songs WHERE albumID = ? AND user_id = ? ORDER BY track, title", (album_id, user_id))
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
    track = payload.get("track")
    length = payload.get("length")

    if not isinstance(title, str):
        connection.close()
        return json_response(False, "Song title is required", None, 400)

    title = title.strip()
    if not title:
        connection.close()
        return json_response(False, "Song title is required", None, 400)

    if track is not None and (not isinstance(track, int) or isinstance(track, bool)):
        connection.close()
        return json_response(False, "Track must be an integer", None, 400)

    if length is not None and (not isinstance(length, int) or isinstance(length, bool)):
        connection.close()
        return json_response(False, "Length must be an integer", None, 400)

    song_id = str(uuid.uuid4())
    cursor.execute(
        "INSERT INTO songs (songID, albumID, title, track, length, user_id) VALUES (?, ?, ?, ?, ?, ?)",
        (song_id, album_id, title, track, length, user_id)
    )
    connection.commit()
    connection.close()

    return json_response(True, "Song created", {"song": {
        "songID": song_id,
        "albumID": album_id,
        "title": title,
        "track": track,
        "length": length,
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
    app.run(debug=os.getenv("FLASK_DEBUG", "False").lower() == "true")
