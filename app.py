from flask import Flask, redirect, render_template, request, flash, session
from flask_bcrypt import Bcrypt
from datetime import timedelta
from dotenv import load_dotenv
import secrets
import sqlite3
import logging

# ---- Setup ----
app = Flask(__name__)
app.secret_key = secrets.token_hex(16)
app.permanent_session_lifetime = timedelta(minutes=30)
load_dotenv()

# ---- Configure Logging ----
logging.basicConfig(
    filename="security.log",
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# ---- Session Security ----
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=False  # True when using HTTPS
)

bcrypt = Bcrypt(app)


@app.before_request
def before_request():
    session.permanent = True


def get_db_connection():
    """Create database connection"""
    connection = sqlite3.connect("app.db")
    connection.row_factory = sqlite3.Row
    return connection


# ---- Routes: Authentication ----

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/home")
def home_dashboard():
    """Protected home page - only for logged in users"""
    if "user_id" not in session:
        return redirect("/")
    return render_template("home.html")


@app.route("/api/register", methods=["POST"])
def register():
    """Register a new user"""
    username = request.form.get("username", "").strip()
    email = request.form.get("email", "").strip()
    password = request.form.get("password", "").strip()
    
    # Validation
    if len(username) < 3:
        flash("Username must be at least 3 characters")
        return redirect("/")
    if len(password) < 8:
        flash("Password must be at least 8 characters")
        return redirect("/")
    if "@" not in email or "." not in email:
        flash("Invalid email format")
        return redirect("/")
    
    # Hash password
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
        
        # Set session
        session["user_id"] = user_id
        logging.info(f"User registered: {username}")
        flash(f"Welcome, {username}! Account created successfully!")
        return redirect("/home")
    except sqlite3.IntegrityError:
        logging.warning(f"Registration failed - duplicate: {username}")
        flash("Username or email already exists")
        return redirect("/")
    except Exception as e:
        logging.error(f"Registration error: {e}")
        flash("An error occurred during registration")
        return redirect("/")


@app.route("/api/login", methods=["POST"])
def login():
    """Login a user"""
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "").strip()
    
    logging.info(f"Login attempt: {username}")
    
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        user = cursor.fetchone()
        connection.close()
        
        if user and bcrypt.check_password_hash(user["password"], password):
            session["user_id"] = user["userID"]
            logging.info(f"Login successful: {username}")
            flash(f"Welcome back, {username}!")
            return redirect("/home")
        else:
            logging.warning(f"Login failed: {username}")
            flash("Invalid username or password")
            return redirect("/")
    except Exception as e:
        logging.error(f"Login error: {e}")
        flash("An error occurred during login")
        return redirect("/")


@app.route("/api/logout", methods=["GET", "POST"])
def logout():
    """Logout user"""
    if "user_id" in session:
        logging.info(f"User logged out: {session['user_id']}")
    session.clear()
    flash("You have been logged out")
    return redirect("/")


# ---- Database Setup ----

@app.route("/setup-db")
def setup_db():
    """Initialize database"""
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
    
    connection.commit()
    connection.close()
    return "Database setup complete"


@app.route("/add-sample")
def add_sample():
    """Add sample users"""
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


if __name__ == "__main__":
    logging.info("Flask application started")
    app.run(debug=True)