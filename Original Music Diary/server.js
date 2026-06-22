/*
###############################################################################
Music Diary PWA - Express.js Backend Server (Security Hardened)

Author: Sam Lucas
Email: sam.lucas5@education.nsw.gov.au
Date: December 12, 2025
Updated: February 16, 2026 - Comprehensive Security Hardening

Purpose: Express.js server with RESTful API endpoints for authentication,
album and song management using SQLite3 database with CORS support.
FULLY SECURED with JWT tokens, password hashing, input validation,
authorization checks, and transaction support.

###############################################################################
*/

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
require('dotenv').config();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secure-secret-key-change-in-production';
const BCRYPT_ROUNDS = 10;

// ========================================
// SECURITY MIDDLEWARE
// ========================================

// Strict CORS - only allow your actual domain
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser with size limits to prevent DoS
app.use(bodyParser.json({ limit: '10kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10kb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'baseFolder')));

// Rate limiting - prevent brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter); // Apply to all routes
app.post('/api/login', loginLimiter); // Stricter limit on login
app.post('/api/register', loginLimiter);

// ========================================
// INPUT VALIDATION UTILITIES
// ========================================

const ValidationRules = {
  username: (val) => val && val.length >= 3 && val.length <= 30 && /^[a-zA-Z0-9_-]+$/.test(val),
  password: (val) => val && val.length >= 8 && val.length <= 128,
  email: (val) => val && validator.isEmail(val),
  albumName: (val) => val && val.length >= 1 && val.length <= 255,
  artist: (val) => val && val.length >= 1 && val.length <= 255,
  year: (val) => !val || (val.length >= 4 && val.length <= 4 && /^\d{4}$/.test(val)),
  songName: (val) => val && val.length >= 1 && val.length <= 255,
  comment: (val) => !val || val.length <= 1000,
  rating: (val) => !val || (Number.isInteger(val) && val >= 0 && val <= 5),
  uuid: (val) => val && validator.isUUID(val),
};

function validateInput(data, rules) {
  const errors = [];
  for (const [field, rule] of Object.entries(rules)) {
    if (!rule(data[field])) {
      errors.push(`Invalid ${field}`);
    }
  }
  return errors;
}

// ========================================
// DATABASE INITIALIZATION
// ========================================

const db = new sqlite3.Database('./music-diary.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

// Enable foreign key constraints
db.run('PRAGMA foreign_keys = ON');

// Serialize critical operations
db.configure('busyTimeout', 5000);

function promisifyDb(fn) {
  return new Promise((resolve, reject) => {
    fn((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function initializeDatabase() {
  db.serialize(() => {
    // Create Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating users table:', err);
    });

    // Create Albums table
    db.run(`
      CREATE TABLE IF NOT EXISTS albums (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        artist TEXT NOT NULL,
        year TEXT,
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('Error creating albums table:', err);
    });

    // Create Songs table
    db.run(`
      CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY,
        album_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        comment TEXT,
        rating INTEGER DEFAULT 0 CHECK(rating >= 0 AND rating <= 5),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('Error creating songs table:', err);
    });
  });
}

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authorization required' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }
}

function verifyOwnership(req, itemTable, itemId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT user_id FROM ${itemTable} WHERE id = ?`,
      [itemId],
      (err, row) => {
        if (err) reject(err);
        else if (!row) resolve(false);
        else resolve(row.user_id === req.userId);
      }
    );
  });
}

// ========================================
// AUTHENTICATION ENDPOINTS
// ========================================

// POST /api/register - User registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, passwordConfirm } = req.body;

    // Validate inputs
    const validationErrors = validateInput(
      { username, email, password },
      {
        username: ValidationRules.username,
        email: ValidationRules.email,
        password: ValidationRules.password,
      }
    );

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed',
        errors: validationErrors 
      });
    }

    if (password !== passwordConfirm) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    // Check if user already exists
    db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email], async (err, row) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (row) {
        return res.status(409).json({ success: false, message: 'Username or email already exists' });
      }

      try {
        // Hash password with bcrypt
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const userId = uuidv4();

        db.run(
          'INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)',
          [userId, username, email, hashedPassword],
          (err) => {
            if (err) {
              return res.status(500).json({ success: false, message: 'Registration failed' });
            }

            const token = jwt.sign(
              { userId, username },
              JWT_SECRET,
              { expiresIn: '24h' }
            );

            res.status(201).json({ 
              success: true, 
              message: 'Registration successful',
              token,
              user: { id: userId, username, email } 
            });
          }
        );
      } catch (hashErr) {
        return res.status(500).json({ success: false, message: 'Registration failed' });
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/login - User login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate inputs
    const validationErrors = validateInput(
      { username, password },
      {
        username: ValidationRules.username,
        password: ValidationRules.password,
      }
    );

    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    db.get(
      'SELECT id, username, email, password FROM users WHERE username = ?',
      [username],
      async (err, user) => {
        if (err) {
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (!user) {
          // Prevent user enumeration with generic message
          return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        try {
          // Compare password with hash
          const passwordMatch = await bcrypt.compare(password, user.password);

          if (!passwordMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
          }

          // Create JWT token
          const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' }
          );

          res.json({
            success: true,
            token,
            user: {
              id: user.id,
              username: user.username,
              email: user.email
            }
          });
        } catch (compareErr) {
          return res.status(500).json({ success: false, message: 'Authentication failed' });
        }
      }
    );
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
})
// ========================================
// ALBUM ENDPOINTS
// ========================================

// GET /api/albums - Get all albums for authenticated user
app.get('/api/albums', verifyToken, (req, res) => {
  db.all(
    'SELECT * FROM albums WHERE user_id = ? ORDER BY created_at DESC',
    [req.userId],
    (err, albums) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      res.json({ success: true, albums });
    }
  );
});

// GET /api/albums/:id - Get single album by ID (verify ownership)
app.get('/api/albums/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID
    if (!ValidationRules.uuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid album ID' });
    }

    // Verify ownership
    const isOwner = await verifyOwnership(req, 'albums', id);
    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    db.get(
      'SELECT * FROM albums WHERE id = ?',
      [id],
      (err, album) => {
        if (err) {
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (!album) {
          return res.status(404).json({ success: false, message: 'Album not found' });
        }

        res.json({ success: true, album });
      }
    );
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/albums/:id/songs - Get all songs for an album (verify ownership)
app.get('/api/albums/:id/songs', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ValidationRules.uuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid album ID' });
    }

    const isOwner = await verifyOwnership(req, 'albums', id);
    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    db.all(
      'SELECT * FROM songs WHERE album_id = ? ORDER BY created_at DESC',
      [id],
      (err, songs) => {
        if (err) {
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        res.json({ success: true, songs: songs || [] });
      }
    );
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/albums - Create new album
app.post('/api/albums', verifyToken, (req, res) => {
  try {
    const { name, artist, year, comment } = req.body;

    // Validate inputs
    const validationErrors = validateInput(
      { name, artist, year, comment },
      {
        name: ValidationRules.albumName,
        artist: ValidationRules.artist,
        year: ValidationRules.year,
        comment: ValidationRules.comment,
      }
    );

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed',
        errors: validationErrors 
      });
    }

    const albumId = uuidv4();

    db.run(
      'INSERT INTO albums (id, user_id, name, artist, year, comment) VALUES (?, ?, ?, ?, ?, ?)',
      [albumId, req.userId, name, artist, year || 'Unknown', comment || ''],
      (err) => {
        if (err) {
          return res.status(500).json({ success: false, message: 'Failed to create album' });
        }

        res.status(201).json({
          success: true,
          album: {
            id: albumId,
            user_id: req.userId,
            name,
            artist,
            year: year || 'Unknown',
            comment: comment || ''
          }
        });
      }
    );
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/albums/:id - Update album (verify ownership)
app.put('/api/albums/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, artist, year, comment } = req.body;

    if (!ValidationRules.uuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid album ID' });
    }

    const isOwner = await verifyOwnership(req, 'albums', id);
    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const validationErrors = validateInput(
      { name, artist, year, comment },
      {
        name: ValidationRules.albumName,
        artist: ValidationRules.artist,
        year: ValidationRules.year,
        comment: ValidationRules.comment,
      }
    );

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed',
        errors: validationErrors 
      });
    }

    db.run(
      'UPDATE albums SET name = ?, artist = ?, year = ?, comment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, artist, year || 'Unknown', comment || '', id],
      (err) => {
        if (err) {
          return res.status(500).json({ success: false, message: 'Failed to update album' });
        }

        res.json({ success: true, message: 'Album updated' });
      }
    );
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/albums/:id - Delete album (verify ownership, use transaction)
app.delete('/api/albums/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ValidationRules.uuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid album ID' });
    }

    const isOwner = await verifyOwnership(req, 'albums', id);
    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Use transaction to ensure data consistency
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      db.run('DELETE FROM songs WHERE album_id = ?', [id], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        db.run('DELETE FROM albums WHERE id = ?', [id], (err) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ success: false, message: 'Database error' });
          }

          db.run('COMMIT', (err) => {
            if (err) {
              return res.status(500).json({ success: false, message: 'Database error' });
            }

            res.json({ success: true, message: 'Album deleted' });
          });
        });
      });
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
})

// ========================================
// SONG ENDPOINTS
// ========================================

// GET /api/songs - Get all songs for album (verify ownership)
app.get('/api/songs', verifyToken, async (req, res) => {
  try {
    const { albumId } = req.query;

    if (!albumId || !ValidationRules.uuid(albumId)) {
      return res.status(400).json({ success: false, message: 'Invalid album ID' });
    }

    const isOwner = await verifyOwnership(req, 'albums', albumId);
    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    db.all(
      'SELECT * FROM songs WHERE album_id = ? ORDER BY created_at DESC',
      [albumId],
      (err, songs) => {
        if (err) {
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        res.json({ success: true, songs });
      }
    );
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/songs - Add song to album
app.post('/api/songs', verifyToken, async (req, res) => {
  try {
    const { albumId, name, comment, rating } = req.body;

    // Validate inputs
    const validationErrors = validateInput(
      { albumId, name, comment, rating },
      {
        albumId: ValidationRules.uuid,
        name: ValidationRules.songName,
        comment: ValidationRules.comment,
        rating: ValidationRules.rating,
      }
    );

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed',
        errors: validationErrors 
      });
    }

    // Verify user owns the album
    const isOwner = await verifyOwnership(req, 'albums', albumId);
    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const songId = uuidv4();

    db.run(
      'INSERT INTO songs (id, album_id, user_id, name, comment, rating) VALUES (?, ?, ?, ?, ?, ?)',
      [songId, albumId, req.userId, name, comment || '', rating || 0],
      (err) => {
        if (err) {
          return res.status(500).json({ success: false, message: 'Failed to create song' });
        }

        res.status(201).json({
          success: true,
          song: {
            id: songId,
            album_id: albumId,
            user_id: req.userId,
            name,
            comment: comment || '',
            rating: rating || 0
          }
        });
      }
    );
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/songs/:id - Update song (verify ownership)
app.put('/api/songs/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, comment, rating } = req.body;

    if (!ValidationRules.uuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid song ID' });
    }

    const isOwner = await verifyOwnership(req, 'songs', id);
    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const validationErrors = validateInput(
      { name, comment, rating },
      {
        name: ValidationRules.songName,
        comment: ValidationRules.comment,
        rating: ValidationRules.rating,
      }
    );

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed',
        errors: validationErrors 
      });
    }

    db.run(
      'UPDATE songs SET name = ?, comment = ?, rating = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, comment || '', rating || 0, id],
      (err) => {
        if (err) {
          return res.status(500).json({ success: false, message: 'Failed to update song' });
        }

        res.json({ success: true, message: 'Song updated' });
      }
    );
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/songs/:id - Delete song (verify ownership)
app.delete('/api/songs/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ValidationRules.uuid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid song ID' });
    }

    const isOwner = await verifyOwnership(req, 'songs', id);
    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    db.run('DELETE FROM songs WHERE id = ?', [id], (err) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      res.json({ success: true, message: 'Song deleted' });
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
})

// ========================================
// USER ENDPOINTS
// ========================================

// GET /api/users/profile - Get current user profile
app.get('/api/users/profile', verifyToken, (req, res) => {
  db.get(
    'SELECT id, username, email, created_at FROM users WHERE id = ?',
    [req.userId],
    (err, user) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      res.json({ success: true, user });
    }
  );
});

// PUT /api/users/profile - Update user profile
app.put('/api/users/profile', verifyToken, async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    // Validate inputs if provided
    if (email) {
      if (!ValidationRules.email(email)) {
        return res.status(400).json({ success: false, message: 'Invalid email' });
      }
    }

    if (newPassword) {
      if (!ValidationRules.password(newPassword)) {
        return res.status(400).json({ success: false, message: 'Password must be 8-128 characters' });
      }

      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password required' });
      }
    }

    // Verify current password if changing password
    db.get('SELECT password FROM users WHERE id = ?', [req.userId], async (err, user) => {
      if (err || !user) {
        return res.status(500).json({ success: false, message: 'User not found' });
      }

      if (newPassword) {
        try {
          const passwordMatch = await bcrypt.compare(currentPassword, user.password);
          if (!passwordMatch) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
          }
        } catch (compareErr) {
          return res.status(500).json({ success: false, message: 'Authentication failed' });
        }
      }

      // Build update query dynamically
      const updates = [];
      const values = [];

      if (email) {
        updates.push('email = ?');
        values.push(email);
      }

      if (newPassword) {
        updates.push('password = ?');
        try {
          const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
          values.push(hashedPassword);
        } catch (hashErr) {
          return res.status(500).json({ success: false, message: 'Password update failed' });
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, message: 'No updates provided' });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(req.userId);

      db.run(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        values,
        (err) => {
          if (err) {
            if (err.message.includes('UNIQUE')) {
              return res.status(409).json({ success: false, message: 'Email already in use' });
            }
            return res.status(500).json({ success: false, message: 'Update failed' });
          }

          res.json({ success: true, message: 'Profile updated' });
        }
      );
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/users/profile - Delete user account
app.delete('/api/users/profile', verifyToken, (req, res) => {
  try {
    // Use transaction to ensure all data is deleted
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // Delete songs
      db.run('DELETE FROM songs WHERE user_id = ?', [req.userId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        // Delete albums
        db.run('DELETE FROM albums WHERE user_id = ?', [req.userId], (err) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ success: false, message: 'Database error' });
          }

          // Delete user
          db.run('DELETE FROM users WHERE id = ?', [req.userId], (err) => {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ success: false, message: 'Database error' });
            }

            db.run('COMMIT', (err) => {
              if (err) {
                return res.status(500).json({ success: false, message: 'Database error' });
              }

              res.json({ success: true, message: 'Account deleted' });
            });
          });
        });
      });
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
})

// ========================================
// HEALTH CHECK
// ========================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// ========================================
// ERROR HANDLING
// ========================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ========================================
// SERVER STARTUP
// ========================================

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Music Diary server running on http://localhost:' + PORT);
  console.log('='.repeat(60));
  console.log('\nSecurity Features Enabled:');
  console.log('✓ JWT Token Authentication');
  console.log('✓ Password Hashing (bcrypt)');
  console.log('✓ Input Validation');
  console.log('✓ Authorization Checks');
  console.log('✓ Rate Limiting');
  console.log('✓ Database Transactions');
  console.log('✓ Foreign Key Constraints');
  console.log('✓ CORS Restrictions');
  console.log('✓ Security Headers');
  console.log('✓ Request Size Limits');
  console.log('\nIMPORTANT: Change JWT_SECRET in production!');
  console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Database error:', err);
    }
    console.log('\nDatabase connection closed');
    process.exit(0);
  });
});
