/*
###############################################################################
Music Diary PWA - Main Application Logic

Author: Sam Lucas
Email: sam.lucas5@education.nsw.gov.au
Date: December 5, 2025

Purpose: Core application logic including authentication, CRUD operations
for albums and songs, DOM manipulation, filtering, sorting, and data
persistence with localStorage

###############################################################################
*/

// API Base URL
const API_BASE = 'http://localhost:3000/api';

// ========================================
// GLOBAL STATE MANAGEMENT
// ========================================

const appState = {
  currentUser: null,
  albums: [],
  songs: {},
  isLoggedIn: false,
};

// Initialize app on page load
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  attachEventListeners();
});

function initializeApp() {
  // Check if user is logged in
  const storedUser = localStorage.getItem('musicDiaryUser');
  if (storedUser) {
    appState.currentUser = JSON.parse(storedUser);
    appState.isLoggedIn = true;
    loadUserData();
  }
  
  // Initialize from API
  loadAllData();
}

function attachEventListeners() {
  // Authentication forms
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const toggleToRegister = document.getElementById('toggleToRegister');
  const toggleToLogin = document.getElementById('toggleToLogin');

  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }

  if (toggleToRegister) {
    toggleToRegister.addEventListener('click', (e) => {
      e.preventDefault();
      showRegisterForm();
    });
  }

  if (toggleToLogin) {
    toggleToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginForm();
    });
  }

  // App page listeners
  const addAlbumBtn = document.getElementById('addAlbumBtn');
  const filterBtn = document.getElementById('filterBtn');
  const sortBtn = document.getElementById('sortBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  if (addAlbumBtn) {
    addAlbumBtn.addEventListener('click', openAddAlbumModal);
  }

  if (filterBtn) {
    filterBtn.addEventListener('click', filterAlbums);
  }

  if (sortBtn) {
    sortBtn.addEventListener('click', sortAlbums);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
}

// ========================================
// HELPER FUNCTIONS - AUTHENTICATION UI
// ========================================

function showLoginForm() {
  const loginSection = document.getElementById('loginSection');
  const registerSection = document.getElementById('registerSection');
  
  if (loginSection && registerSection) {
    loginSection.classList.add('active');
    registerSection.classList.remove('active');
  }
}

function showRegisterForm() {
  const loginSection = document.getElementById('loginSection');
  const registerSection = document.getElementById('registerSection');
  
  if (loginSection && registerSection) {
    loginSection.classList.remove('active');
    registerSection.classList.add('active');
  }
}

// ========================================
// AUTHENTICATION FUNCTIONS
// ========================================

async function handleRegister(event) {
  event.preventDefault();
  
  const username = document.getElementById('registerUsername')?.value.trim();
  const email = document.getElementById('registerEmail')?.value.trim();
  const password = document.getElementById('registerPassword')?.value.trim();
  const passwordConfirm = document.getElementById('registerPasswordConfirm')?.value.trim();

  // Validate input on client side
  if (!username || !email || !password || !passwordConfirm) {
    showAlert('Please fill in all fields', 'error');
    return;
  }

  if (password !== passwordConfirm) {
    showAlert('Passwords do not match', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, passwordConfirm })
    });

    const data = await response.json();

    if (!data.success) {
      if (data.errors && Array.isArray(data.errors)) {
        showAlert(data.errors.join(', '), 'error');
      } else {
        showAlert(data.message || 'Registration failed', 'error');
      }
      return;
    }

    // Store token and user info
    appState.currentUser = data.user;
    appState.isLoggedIn = true;
    localStorage.setItem('musicDiaryToken', data.token);
    localStorage.setItem('musicDiaryUser', JSON.stringify(appState.currentUser));
    
    showAlert(`Welcome, ${username}! Account created successfully!`, 'success');
    
    // Load user data and redirect
    setTimeout(async () => {
      await loadUserData();
      window.location.href = 'pages/home.html';
    }, 1500);
  } catch (error) {
    console.error('Registration error:', error);
    showAlert('Registration error: ' + error.message, 'error');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  
  const username = document.getElementById('loginUsername')?.value.trim();
  const password = document.getElementById('loginPassword')?.value.trim();

  // Validate input
  if (!username || !password) {
    showAlert('Please enter username and password', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!data.success) {
      showAlert(data.message || 'Login failed', 'error');
      return;
    }

    // Store token and user info
    appState.currentUser = data.user;
    appState.isLoggedIn = true;
    localStorage.setItem('musicDiaryToken', data.token);
    localStorage.setItem('musicDiaryUser', JSON.stringify(appState.currentUser));
    
    showAlert(`Welcome back, ${username}!`, 'success');
    
    // Load user data and redirect
    setTimeout(async () => {
      await loadUserData();
      window.location.href = 'pages/home.html';
    }, 1000);
  } catch (error) {
    console.error('Login error:', error);
    showAlert('Login error: ' + error.message, 'error');
  }
}


function handleLogout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('musicDiaryToken');
    localStorage.removeItem('musicDiaryUser');
    appState.currentUser = null;
    appState.isLoggedIn = false;
    
    showAlert('You have been logged out', 'success');
    setTimeout(() => {
      window.location.href = '../index.html';
    }, 1000);
  }
}

// ========================================
// API HELPER FUNCTIONS
// ========================================

/**
 * Make an authenticated API call with JWT token
 * Handles token refresh and auto-logout if token expired
 */
async function authenticatedFetch(url, options = {}) {
  const token = localStorage.getItem('musicDiaryToken');
  
  if (!token) {
    showAlert('Session expired. Please login again.', 'error');
    setTimeout(() => {
      window.location.href = '../index.html';
    }, 1500);
    return null;
  }

  const headers = options.headers || {};
  headers['Authorization'] = `Bearer ${token}`;
  headers['Content-Type'] = 'application/json';

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    // Check if token expired
    if (response.status === 401) {
      localStorage.removeItem('musicDiaryToken');
      localStorage.removeItem('musicDiaryUser');
      showAlert('Session expired. Please login again.', 'error');
      setTimeout(() => {
        window.location.href = '../index.html';
      }, 1500);
      return null;
    }

    return response;
  } catch (error) {
    console.error('API call error:', error);
    showAlert('Network error: ' + error.message, 'error');
    return null;
  }
}


// ========================================
// ALBUM MANAGEMENT
// ========================================

function openAddAlbumModal() {
  const modal = document.getElementById('addAlbumModal');
  if (modal) {
    modal.classList.add('active');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

// Add new album
async function handleAddAlbum(event) {
  event.preventDefault();

  const albumName = document.getElementById('albumName')?.value.trim();
  const artistName = document.getElementById('artistName')?.value.trim();
  const releaseYear = document.getElementById('releaseYear')?.value.trim();
  const albumComment = document.getElementById('albumComment')?.value.trim();

  // Validate input
  if (!albumName || !artistName) {
    showAlert('Please enter album and artist name', 'error');
    return;
  }

  try {
    const response = await authenticatedFetch(`${API_BASE}/albums`, {
      method: 'POST',
      body: JSON.stringify({
        name: albumName,
        artist: artistName,
        year: releaseYear,
        comment: albumComment
      })
    });

    if (!response) return; // authenticatedFetch handles errors

    const data = await response.json();
    if (!data.success) {
      if (data.errors && Array.isArray(data.errors)) {
        showAlert(data.errors.join(', '), 'error');
      } else {
        showAlert(data.message || 'Failed to add album', 'error');
      }
      return;
    }
    
    // Update state and UI
    appState.albums.push(data.album);
    appState.songs[data.album.id] = [];
    
    showAlert('Album added successfully!', 'success');
    
    document.getElementById('addAlbumForm')?.reset();
    closeModal('addAlbumModal');
    renderAlbums();
  } catch (error) {
    console.error('Error adding album:', error);
    showAlert('Error adding album: ' + error.message, 'error');
  }
}

// Delete album
async function deleteAlbum(albumId) {
  if (confirm('Are you sure you want to delete this album? This cannot be undone.')) {
    try {
      const response = await authenticatedFetch(`${API_BASE}/albums/${albumId}`, {
        method: 'DELETE'
      });

      if (!response) return; // authenticatedFetch handles errors

      const data = await response.json();
      if (!data.success) {
        showAlert(data.message || 'Failed to delete album', 'error');
        return;
      }

      appState.albums = appState.albums.filter(a => a.id !== albumId);
      delete appState.songs[albumId];
      showAlert('Album deleted successfully', 'success');
      renderAlbums();
    } catch (error) {
      console.error('Error deleting album:', error);
      showAlert('Error deleting album: ' + error.message, 'error');
    }
  }
}

// Edit album details
async function editAlbum(albumId) {
  const album = appState.albums.find(a => a.id === albumId);
  if (!album) return;

  const newName = prompt('Enter new album name:', album.name);
  if (newName === null) return;

  const newArtist = prompt('Enter new artist name:', album.artist);
  if (newArtist === null) return;

  try {
    const response = await authenticatedFetch(`${API_BASE}/albums/${albumId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: newName.trim(),
        artist: newArtist.trim(),
        year: album.year,
        comment: album.comment
      })
    });

    if (!response) return; // authenticatedFetch handles errors

    const data = await response.json();
    if (!data.success) {
      showAlert(data.message || 'Failed to update album', 'error');
      return;
    }

    album.name = newName.trim();
    album.artist = newArtist.trim();
    
    showAlert('Album updated successfully', 'success');
    renderAlbums();
  } catch (error) {
    console.error('Error updating album:', error);
    showAlert('Error updating album: ' + error.message, 'error');
  }
}

// ========================================
// SONG MANAGEMENT
// ========================================

function openAlbumDetails(albumId) {
  window.location.href = `album-detail.html?id=${albumId}`;
}

// Add new song to album
async function addSongToAlbum(event, albumId) {
  event?.preventDefault();

  const songName = document.getElementById(`songName-${albumId}`)?.value.trim();
  const songComment = document.getElementById(`songComment-${albumId}`)?.value.trim();
  const songRating = document.getElementById(`songRating-${albumId}`)?.value || 0;

  if (!songName) {
    showAlert('Please enter a song name', 'error');
    return;
  }

  try {
    const response = await authenticatedFetch(`${API_BASE}/songs`, {
      method: 'POST',
      body: JSON.stringify({
        albumId: albumId,
        name: songName,
        comment: songComment,
        rating: parseInt(songRating)
      })
    });

    if (!response) return;

    const data = await response.json();
    if (!data.success) {
      showAlert(data.message || 'Failed to add song', 'error');
      return;
    }

    if (!appState.songs[albumId]) {
      appState.songs[albumId] = [];
    }

    appState.songs[albumId].push(data.song);
    showAlert('Song added successfully!', 'success');

    // Clear inputs
    const songNameInput = document.getElementById(`songName-${albumId}`);
    if (songNameInput) songNameInput.value = '';
    const songCommentInput = document.getElementById(`songComment-${albumId}`);
    if (songCommentInput) songCommentInput.value = '';
    const songRatingInput = document.getElementById(`songRating-${albumId}`);
    if (songRatingInput) songRatingInput.value = 0;

    // Refresh the songs display on album detail page if function exists
    if (typeof renderSongDetail === 'function') {
      renderSongDetail(albumId);
    } else {
      renderSongs(albumId);
    }
  } catch (error) {
    console.error('Error adding song:', error);
    showAlert('Error adding song: ' + error.message, 'error');
  }
}

async function deleteSong(albumId, songId) {
  if (confirm('Delete this song?')) {
    try {
      const response = await authenticatedFetch(`${API_BASE}/songs/${songId}`, {
        method: 'DELETE'
      });

      if (!response) return;

      const data = await response.json();
      if (!data.success) {
        showAlert(data.message || 'Failed to delete song', 'error');
        return;
      }

      appState.songs[albumId] = appState.songs[albumId].filter(s => s.id !== songId);
      showAlert('Song deleted', 'success');
      renderSongs(albumId);
    } catch (error) {
      console.error('Error deleting song:', error);
      showAlert('Error deleting song: ' + error.message, 'error');
    }
  }
}

async function updateSongRating(albumId, songId, newRating) {
  const song = appState.songs[albumId]?.find(s => s.id === songId);
  if (song) {
    try {
      const response = await authenticatedFetch(`${API_BASE}/songs/${songId}`, {
        method: 'PUT',
        body: JSON.stringify({ rating: newRating })
      });

      if (!response) return;

      const data = await response.json();
      if (!data.success) {
        showAlert(data.message || 'Failed to update rating', 'error');
        return;
      }

      song.rating = newRating;
    } catch (error) {
      console.error('Error updating rating:', error);
      showAlert('Error updating rating: ' + error.message, 'error');
    }
  }
}

// ========================================
// RENDERING FUNCTIONS
// ========================================

function renderAlbums() {
  const container = document.getElementById('albumsGrid');
  if (!container) return;

  if (appState.albums.length === 0) {
    container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">No albums yet. Add one to get started!</p>';
    return;
  }

// Render albums 
  container.innerHTML = appState.albums.map(album => `
    <div class="card" data-album-id="${album.id}">
      <div class="card-image">🎵</div>
      <div class="card-title">${escapeHtml(album.name)}</div>
      <div class="card-subtitle">${escapeHtml(album.artist)}</div>
      <div class="card-meta">
        <span>${album.year}</span>
        <span class="card-rating">${appState.songs[album.id]?.length || 0} songs</span>
      </div>
      <div style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 1rem;">
        ${album.comment ? `<p>${escapeHtml(album.comment)}</p>` : '<p>No comment</p>'}
      </div>
      <div class="card-actions">
        <button class="btn btn-secondary btn-small" onclick="openAlbumDetails('${album.id}')">View Songs</button>
        <button class="btn btn-secondary btn-small" onclick="editAlbum('${album.id}')">Edit</button>
        <button class="btn btn-danger btn-small" onclick="deleteAlbum('${album.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function renderSongs(albumId) {
  const container = document.getElementById(`songsList-${albumId}`);
  if (!container) return;

  const songs = appState.songs[albumId] || [];

  if (songs.length === 0) {
    container.innerHTML = '<p style="color: var(--text-secondary);">No songs added yet</p>';
    return;
  }

  container.innerHTML = songs.map(song => `
    <div class="song-item">
      <div>
        <div class="song-title">${escapeHtml(song.name)}</div>
        ${song.comment ? `<div class="song-comment">${escapeHtml(song.comment)}</div>` : ''}
      </div>
      <div>
        <div style="color: var(--warning-color); font-weight: bold;">⭐ ${song.rating}/5</div>
      </div>
      <button class="btn btn-danger btn-small" onclick="deleteSong('${albumId}', '${song.id}')">Remove</button>
    </div>
  `).join('');
}

// ========================================
// FILTERING & SORTING
// ========================================

function filterAlbums() {
  const filterType = document.getElementById('filterType')?.value;
  const filterValue = document.getElementById('filterValue')?.value.toLowerCase();

  if (!filterType || !filterValue) {
    showAlert('Please select a filter type and enter a value', 'error');
    return;
  }

  let filtered = appState.albums;

  if (filterType === 'artist') {
    filtered = filtered.filter(a => a.artist.toLowerCase().includes(filterValue));
  } else if (filterType === 'year') {
    filtered = filtered.filter(a => a.year === filterValue);
  } else if (filterType === 'name') {
    filtered = filtered.filter(a => a.name.toLowerCase().includes(filterValue));
  }

  displayFilteredAlbums(filtered);
  showAlert(`Found ${filtered.length} album(s)`, 'success');
}

function sortAlbums() {
  const sortType = document.getElementById('sortType')?.value;
  if (!sortType) {
    showAlert('Please select a sort option', 'error');
    return;
  }

  let sorted = [...appState.albums];

  switch (sortType) {
    case 'name-asc':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'name-desc':
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'artist':
      sorted.sort((a, b) => a.artist.localeCompare(b.artist));
      break;
    case 'year-newest':
      sorted.sort((a, b) => parseInt(b.year) - parseInt(a.year));
      break;
    case 'year-oldest':
      sorted.sort((a, b) => parseInt(a.year) - parseInt(b.year));
      break;
    case 'rating':
      sorted.sort((a, b) => {
        const avgA = calculateAlbumRating(appState.songs[a.id] || []);
        const avgB = calculateAlbumRating(appState.songs[b.id] || []);
        return avgB - avgA;
      });
      break;
  }

  displayFilteredAlbums(sorted);
  showAlert('Albums sorted', 'success');
}

function displayFilteredAlbums(albums) {
  const container = document.getElementById('albumsGrid');
  if (!container) return;

  if (albums.length === 0) {
    container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">No results found</p>';
    return;
  }

  container.innerHTML = albums.map(album => `
    <div class="card" data-album-id="${album.id}">
      <div class="card-image">🎵</div>
      <div class="card-title">${escapeHtml(album.name)}</div>
      <div class="card-subtitle">${escapeHtml(album.artist)}</div>
      <div class="card-meta">
        <span>${album.year}</span>
        <span class="card-rating">${appState.songs[album.id]?.length || 0} songs</span>
      </div>
      <div style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 1rem;">
        ${album.comment ? `<p>${escapeHtml(album.comment)}</p>` : '<p>No comment</p>'}
      </div>
      <div class="card-actions">
        <button class="btn btn-secondary btn-small" onclick="openAlbumDetails('${album.id}')">View Songs</button>
        <button class="btn btn-secondary btn-small" onclick="editAlbum('${album.id}')">Edit</button>
        <button class="btn btn-danger btn-small" onclick="deleteAlbum('${album.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

// ========================================
// RATING SYSTEM
// ========================================

function calculateAlbumRating(songs) {
  if (songs.length === 0) return 0; // No songs, no rating
  const sum = songs.reduce((acc, song) => acc + song.rating, 0); // Sum all song ratings
  return (sum / songs.length).toFixed(1); // One decimal place
}

function renderStarRating(currentRating, onClickCallback) {
  let stars = '';
  for (let i = 1; i <= 5; i++) { 
    const isActive = i <= currentRating ? 'active' : '';
    stars += `<span class="star ${isActive}" onclick="${onClickCallback}(${i})" data-value="${i}">⭐</span>`; // Star with click handler
  }
  return `<div class="star-rating">${stars}</div>`;
}

// ========================================
// DATA PERSISTENCE
// ========================================

async function loadUserData() {
  if (!appState.currentUser) return;

  try {
    const albumsResponse = await authenticatedFetch(`${API_BASE}/albums`);
    if (!albumsResponse) return;
    const albumsData = await albumsResponse.json();

    if (albumsData.success) {
      appState.albums = albumsData.albums || [];
      
      // Load songs for each album
      for (const album of appState.albums) {
        const songsResponse = await authenticatedFetch(`${API_BASE}/songs?albumId=${album.id}`);
        if (!songsResponse) continue;
        const songsData = await songsResponse.json();
        if (songsData.success) {
          appState.songs[album.id] = songsData.songs || [];
        }
      }
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

async function loadAllData() {
  await loadUserData();
  renderAlbums();
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function showAlert(message, type = 'info') {
  const alertContainer = document.getElementById('alertContainer') || createAlertContainer();
  
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} show`;
  alert.innerHTML = `
    <button class="modal-close" onclick="this.parentElement.remove()" style="float: right;">×</button>
    ${escapeHtml(message)}
  `;
  
  alertContainer.appendChild(alert);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    alert.remove();
  }, 5000);
}

function createAlertContainer() {
  const container = document.createElement('div');
  container.id = 'alertContainer';
  container.style.cssText = 'position: fixed; top: 80px; right: 20px; z-index: 3000; max-width: 400px;';
  document.body.appendChild(container);
  return container;
}

function escapeHtml(text) { // Prevent XSS
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]); // Replace special characters
}

// Close modals when clicking outside
document.addEventListener('click', (event) => {
  if (event.target.classList.contains('modal')) {
    event.target.classList.remove('active');
  }
});

// Close modals with escape key
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach(modal => {
      modal.classList.remove('active');
    });
  }
});
