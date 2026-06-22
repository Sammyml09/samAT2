# Music Diary PWA - Installation & Usage Guide

## Overview

Music Diary is a Progressive Web App (PWA) that allows you to catalogue and manage your music library with albums, songs, and ratings. This guide explains how to install dependencies and run the application on both **macOS** and **Windows**.

---

## System Requirements

- **Node.js** (v14.0 or higher)
- **npm** (v6.0 or higher)
- A modern web browser (Chrome, Firefox, Safari, or Edge)
- 100MB free disk space

---

## Installation

### Step 1: Install Node.js & npm

#### macOS
```bash
# Using Homebrew (recommended)
brew install node

# Or download from official website
# https://nodejs.org/
```

Verify installation:
```bash
node --version
npm --version
```

#### Windows
1. Download the LTS installer from https://nodejs.org/
2. Run the installer and follow the setup wizard
3. Keep all default settings checked
4. Restart your computer after installation

Verify installation (open PowerShell or Command Prompt):
```cmd
node --version
npm --version
```

---

### Step 2: Navigate to Project Directory

#### macOS
```bash
cd ~/Documents/Y12\ WEB/samLucasAssessmentTask/MusicDiary
# or
cd "/Users/samlucas/Documents/Y12 WEB/samLucasAssessmentTask/MusicDiary"
```

#### Windows
```cmd
cd "C:\Users\samlucas\Documents\Y12 WEB\samLucasAssessmentTask\MusicDiary"
```

(Replace `samlucas` with your actual Windows username if different)

---

### Step 3: Install Project Dependencies

Both macOS and Windows use the same command:

```bash
npm install
```

This will install the following dependencies:
- **express** - Web server framework
- **sqlite3** - Database management
- **body-parser** - Request body parsing
- **cors** - Cross-Origin Resource Sharing
- **uuid** - Unique identifier generation

The installation may take 1-2 minutes. You'll see a lot of output—this is normal. Once complete, you should see:
```
added XX packages
```

---

## Running the Application

### macOS

#### Option 1: Using npm script
```bash
npm start
```

#### Option 2: Direct node command
```bash
node server.js
```

**Expected output:**
```
Server running at http://localhost:3000
Database connected successfully
```

### Windows

#### Option 1: Using PowerShell/Command Prompt
```cmd
npm start
```

#### Option 2: Direct node command
```cmd
node server.js
```

**Expected output:**
```
Server running at http://localhost:3000
Database connected successfully
```

---

## Accessing the Application

Once the server is running, open your web browser and navigate to:

```
http://localhost:3000
```

### Default Test Credentials

**Username:** `demo`  
**Password:** `demo123`

---

## Initial Setup (First Time Only)

The application comes with a pre-populated SQLite3 database (`music-diary.db`). If you need to reset the database:

### macOS
```bash
rm music-diary.db
npm start
```

### Windows
```cmd
del music-diary.db
npm start
```

This will create a fresh database with demo data.

## Troubleshooting

### Error: "npm: command not found"
**Solution:** Node.js/npm is not installed or not in your system PATH
- Reinstall Node.js
- Restart your terminal/PowerShell
- On Windows, you may need to restart your computer

### Error: "Port 3000 already in use"
**Solution:** Another application is using port 3000
```bash
# macOS: Find and kill the process
lsof -i :3000
kill -9 <PID>

# Windows: Find and kill the process
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

Or use a different port by setting an environment variable:

**macOS:**
```bash
PORT=3001 npm start
```

**Windows:**
```cmd
set PORT=3001
npm start
```

### Error: "Cannot find module 'express'"
**Solution:** Dependencies not installed
```bash
npm install
```

### Error: "SQLITE_CANTOPEN: unable to open database file"
**Solution:** Permission issue or database path problem
```bash
# macOS & Windows: Delete the database and let it recreate
rm music-diary.db  # macOS
del music-diary.db # Windows
npm start
```

### Service Worker not registering
**Solution:** Clear browser cache and restart server
1. Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (macOS)
2. Clear browsing data
3. Refresh the page
4. Restart the server


## API Endpoints (Advanced Users)

The application provides a RESTful API with 13 endpoints:

### Authentication
- `POST /api/login` - User login
- `POST /api/register` - Create new user

### Albums
- `GET /api/albums` - Get all user albums
- `POST /api/albums` - Create new album
- `PUT /api/albums/:id` - Update album
- `DELETE /api/albums/:id` - Delete album

### Songs
- `GET /api/songs?albumId=:id` - Get songs in album
- `POST /api/songs` - Add song to album
- `PUT /api/songs/:id` - Update song/rating
- `DELETE /api/songs/:id` - Remove song

---

## Database Information

**Database File:** `music-diary.db`

**Tables:**
1. **users** - User accounts and authentication
2. **albums** - Album collection data
3. **songs** - Individual song information

**Demo Data Included:**
- Demo account (username: `demo`, password: `demo123`)
- 3 sample albums with songs and ratings

---

## Stopping the Server

To stop the server, press:

```
Ctrl + C
```

(Both macOS and Windows)

The server will gracefully shut down. You can restart it at any time using `npm start`.

