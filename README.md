# Secure Software App

## Overview
A Flask-based authentication system with secure user registration, login, and account management features. Users can register with validated credentials, log in securely, and manage their password and email with bcrypt hashing and session security.

## Features
- User registration with username/password/email validation
- Secure login with session management
- Change password functionality with old password verification
- Change email functionality with password confirmation
- Real-time form validation with visual feedback
- WCAG AAA accessibility compliance
- Security logging for all authentication events
- 30-minute persistent session timeout
- HTTP-only cookies and SameSite protection

## System Requirements
- Python 3.8 or higher
- macOS or Windows

## Installation & Setup

### macOS Instructions

1. **Navigate to the project directory:**
   ```bash
   cd /Users/samlucas/Documents/Coding/Python/samAT2
   ```

2. **Install dependencies:**
   ```bash
   chmod +x install_dependencies.sh

   or 

   ./install_dependencies.sh
   ```

   This script will:
   - Create a Python virtual environment
   - Activate it
   - Install all required packages from `requirements.txt`

3. **Activate the virtual environment (if not already active):**
   ```bash
   source venv/bin/activate
   ```

4. **Create your environment file:**
   ```bash
   cp .env.example .env
   ```
   Then set `SECRET_KEY`, `SPOTIFY_CLIENT_ID`, and `SPOTIFY_CLIENT_SECRET` in `.env`.

5. **Run the Flask app:**
   ```bash
   flask run 
   ```
   The app will start on `http://localhost:5000`

### Windows Instructions

1. **Navigate to the project directory:**
   
    In VS Code, open terminal and navigate to directory if needed.

2. **Install dependencies:**
   ```cmd
   pip install -r requirements.txt
   ```
   This installs all required packages from `requirements.txt`

3. **Create and activate the virtual environment:**
   ```cmd
   python -m venv venv
   venv\Scripts\activate
   ```

4. **Create your environment file and update secrets:**
   ```cmd
   copy .env.example .env
   ```
   Then set `SECRET_KEY`, `SPOTIFY_CLIENT_ID`, and `SPOTIFY_CLIENT_SECRET` in `.env`.

5. **Run the Flask app:**
   ```cmd
   flask run
   ```
   The app will start on `http://localhost:5000`

## Project Structure

```
samAT2/
├── app.py                          # Main Flask application
├── requirements.txt                # Python dependencies
├── install_dependencies.sh         # Automated setup script (macOS/Linux)
├── app.db                          # SQLite database (auto-created)
├── security.log                    # Authentication event logs
├── templates/
│   ├── index.html                  # Login/registration page
│   └── home.html                   # User dashboard with account settings
├── static/
│   ├── css/
│   │   └── style.css               # Dark theme design system
│   └── js/
│       └── script.js               # Client-side validation and alerts
└── images/                         # Image assets
```

## How to Use

### First Time Setup
1. Install dependencies using the instructions above
2. Run the app with `flask run --debug`
3. Visit `http://localhost:5000` in your browser
4. The database (`app.db`) will be created automatically

### Register a New Account
1. Click "Register" on the login page
2. Enter a username (letters only, 3+ characters)
3. Enter your email (must contain @ and .)
4. Enter a password (8+ characters, uppercase, lowercase, numbers)
5. Confirm your password
6. Click "Register"

### Login
1. Enter your username
2. Enter your password
3. Click "Login"

### Change Password
1. After logging in, click "Account Settings"
2. Click the "Change Password" tab
3. Enter your current password
4. Enter your new password (must meet requirements)
5. Confirm your new password
6. Click "Update Password"

### Change Email
1. After logging in, click "Account Settings"
2. Click the "Change Email" tab
3. Enter your new email address
4. Enter your password to confirm the change
5. Click "Update Email"

### Logout
- Click the "Logout" button in the top-right corner
- Your session will be cleared and you'll be redirected to the login page

## Dependencies
- **Flask** - Web framework
- **Flask-Bcrypt** - Password hashing
- **Werkzeug** - WSGI utilities
- **python-dotenv** - Environment variable management

All dependencies are listed in `requirements.txt`

## Album Metadata Source
- Album cover and release year are fetched from the Spotify Web API.
- Keep Spotify credentials in `.env` only (never hardcode keys in source files).
- `SPOTIFY_API_KEY` can be used as an alias for `SPOTIFY_CLIENT_ID`.
- `SPOTIFY_CLIENT_ID` by itself is not enough for album search; you also need `SPOTIFY_CLIENT_SECRET`, or a valid bearer `SPOTIFY_ACCESS_TOKEN`.
- If local TLS certificate verification fails, set `SPOTIFY_TLS_VERIFY=false` (local development only).

## Automation Feature: Album Recommendations
- The album detail page includes an automated recommendation section.
- The system uses the selected album's Spotify metadata and release year as input signals.
- It returns 4 similar albums with cover art and names using Spotify data and randomized ranking for variety.
- Recommendations load asynchronously so the rest of the page renders immediately.

## Security Features
- Bcrypt password hashing with salting
- HTTP-only cookies (prevents JavaScript access)
- SameSite cookie protection (CSRF prevention)
- Server-side validation (authoritative security check)
- Client-side validation (instant user feedback)
- Security logging for all authentication events
- SQLite database with unique constraints
- Session expiration after 30 minutes of inactivity

## Troubleshooting

### Port 5000 Already in Use
If you get "Address already in use" error:

**macOS:**
```bash
lsof -i :5000 | grep -v COMMAND | awk '{print $2}' | xargs kill -9
```

**Windows:**
```cmd
netstat -ano | findstr :5000
taskkill /PID [PID_NUMBER] /F
```
Then retry with `flask run`


### Database Errors
Delete `app.db` and restart the app. The database will be recreated automatically on startup.
