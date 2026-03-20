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

# Setup 
app = Flask(__name__)
app.secret_key = secrets.token_hex(16)
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
    SESSION_COOKIE_SECURE=True  # True in production
)


bcrypt = Bcrypt(app)


# Refresh session 
@app.before_request
def before_request():
    session.permanent = True


# Create database
def get_db_connection():
    """Create database connection"""
    connection = sqlite3.connect("app.db")
    connection.row_factory = sqlite3.Row
    return connection


# Validate Password 
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


# Validate Username
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


# Route to index.html
@app.route("/")
def home():
    return render_template("index.html")


# Route to main, checking for user_id
@app.route("/home")
def home_dashboard():
    if "user_id" not in session:
        return redirect("/")
    return render_template("home.html")


# Manage regestration, access to DB
@app.route("/api/register", methods=["POST"])
def register():
    username = request.form.get("username", "").strip()
    email = request.form.get("email", "").strip()
    password = request.form.get("password", "").strip()
    confirm_password = request.form.get("confirm_password", "").strip()
    
    # Validate username
    is_valid, message = validate_username(username)
    if not is_valid:
        return redirect("/")
    
    # Validate password format
    is_valid, message = validate_password(password)
    if not is_valid:
        return redirect("/")
    
    # Checking to see if its the same
    if password != confirm_password:
        return redirect("/")
    
    # Check for @
    if "@" not in email or "." not in email:
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
        logging.info(f"User registered: {repr(username)}")
        return redirect("/home")
    except sqlite3.IntegrityError:
        logging.warning(f"Registration failed - duplicate: {repr(username)}")
        return redirect("/")
    except Exception as e:
        logging.error(f"Registration error: {e}")
        return redirect("/")

# Login check
@app.route("/api/login", methods=["POST"])
def login():
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "").strip()
    
    logging.info(f"Login attempt: {repr(username)}")
    
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        user = cursor.fetchone()
        connection.close()
        
        if user and bcrypt.check_password_hash(user["password"], password):
            session["user_id"] = user["userID"]
            logging.info(f"Login successful: {repr(username)}")
            return redirect("/home")
        else:
            logging.warning(f"Login failed: {repr(username)}")
            return redirect("/")
    except Exception as e:
        logging.error(f"Login error: {e}")
        return redirect("/")


# Clear session with logout
@app.route("/api/logout", methods=["GET", "POST"])
def logout():
    if "user_id" in session:
        logging.info(f"User logged out: {session['user_id']}")
    session.clear()
    return redirect("/")


#Change password route, JSON to AJAX 
@app.route("/api/change-password", methods=["POST"])
def change_password():
    """Change user password"""
    if "user_id" not in session:
        return redirect("/")
    
    user_id = session["user_id"]
    old_password = request.form.get("old_password", "").strip()
    new_password = request.form.get("new_password", "").strip()
    confirm_password = request.form.get("confirm_password", "").strip()
    
    # Validate inputs
    if not old_password or not new_password or not confirm_password:
        return jsonify({"success": False, "message": "All fields are required"}), 400
    
    # Validate new password format
    is_valid, message = validate_password(new_password)
    if not is_valid:
        return jsonify({"success": False, "message": message}), 400
    
    # Check passwords match
    if new_password != confirm_password:
        return jsonify({"success": False, "message": "New passwords do not match"}), 400
    
    # Check old password is different
    if old_password == new_password:
        return jsonify({"success": False, "message": "New password must be different from old password"}), 400
    
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT password FROM users WHERE userID = ?", (user_id,))
        user = cursor.fetchone()
        connection.close()
        
        if not user or not bcrypt.check_password_hash(user["password"], old_password):
            logging.warning(f"Password change failed - invalid old password: {user_id}")
            return jsonify({"success": False, "message": "Current password is incorrect"}), 401
        
        # Hash new password and update database
        hashed_password = bcrypt.generate_password_hash(new_password).decode("utf-8")
        
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(
            "UPDATE users SET password = ? WHERE userID = ?",
            (hashed_password, user_id)
        )
        connection.commit()
        connection.close()
        
        logging.info(f"Password changed for user: {user_id}")
        return jsonify({"success": True, "message": "Password changed successfully!"}), 200
    
    except Exception as e:
        logging.error(f"Change password error: {e}")
        return jsonify({"success": False, "message": "An error occurred while changing password"}), 500


# Change email route, same JSON to AJAX
@app.route("/api/change-email", methods=["POST"])
def change_email():

    if "user_id" not in session:
        return jsonify({"success": False, "message": "Please log in first"}), 401
    
    user_id = session["user_id"]
    password = request.form.get("password", "").strip()
    new_email = request.form.get("new_email", "").strip()
    
    # Validate inputs
    if not password or not new_email:
        return jsonify({"success": False, "message": "All fields are required"}), 400
    
    # Validate email format
    if "@" not in new_email or "." not in new_email:
        return jsonify({"success": False, "message": "Invalid email format"}), 400
    
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT password, email FROM users WHERE userID = ?", (user_id,))
        user = cursor.fetchone()
        connection.close()
        
        if not user or not bcrypt.check_password_hash(user["password"], password):
            logging.warning(f"Email change failed - invalid password: {user_id}")
            return jsonify({"success": False, "message": "Password is incorrect"}), 401
        
        if user["email"] == new_email:
            return jsonify({"success": False, "message": "New email must be different from current email"}), 400
        
        # Update email in database
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(
            "UPDATE users SET email = ? WHERE userID = ?",
            (new_email, user_id)
        )
        connection.commit()
        connection.close()
        
        logging.info(f"Email changed for user: {user_id}")
        return jsonify({"success": True, "message": "Email changed successfully!"}), 200
    
    except sqlite3.IntegrityError:
        logging.warning(f"Email change failed - duplicate email: {user_id}")
        return jsonify({"success": False, "message": "Email already in use"}), 400
    except Exception as e:
        logging.error(f"Change email error: {e}")
        return jsonify({"success": False, "message": "An error occurred while changing email"}), 500


# Database Setup
@app.route("/setup-db")
def setup_db():
    
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




# Sample data to be added to database for testing purposes
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


if __name__ == "__main__":
    logging.info("Flask application started")
    app.run(debug=os.getenv("FLASK_DEBUG", "False").lower() == "true")