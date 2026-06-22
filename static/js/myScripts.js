const API_BASE = '/api';
const state = { currentUser: null, albums: [], songs: {} };

function setStatus(message, type = 'info') {
  const el = document.getElementById('status-message') || document.getElementById('auth-status');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function showUserArea(isLoggedIn) {
  const authSection = document.getElementById('auth-section');
  const userArea = document.getElementById('user-area');
  if (authSection) authSection.style.display = isLoggedIn ? 'none' : 'block';
  if (userArea) userArea.style.display = isLoggedIn ? 'block' : 'none';
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  return { response, data };
}

async function checkSession() {
  const { response, data } = await requestJson('/albums', { method: 'GET' });
  if (response.ok) {
    state.currentUser = data?.data?.albums ? { ok: true } : { ok: true };
    showUserArea(true);
    setStatus('Signed in.');
    return true;
  }
  showUserArea(false);
  return false;
}

async function handleRegister(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    username: form.username.value,
    email: form.email.value,
    password: form.password.value,
    confirm_password: form.confirm_password.value
  };

  const { response, data } = await requestJson('/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (response.ok) {
    state.currentUser = { username: payload.username };
    showUserArea(true);
    setStatus(data?.message || 'Registration successful');
    if (window.location.pathname.endsWith('home.html')) {
      window.location.href = 'albums.html';
    }
  } else {
    setStatus(data?.message || 'Registration failed', 'error');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    username: form.username.value,
    password: form.password.value
  };

  const { response, data } = await requestJson('/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (response.ok) {
    state.currentUser = { username: payload.username };
    showUserArea(true);
    setStatus(data?.message || 'Login successful');
    if (window.location.pathname.endsWith('home.html')) {
      window.location.href = 'albums.html';
    }
  } else {
    setStatus(data?.message || 'Login failed', 'error');
  }
}

async function handleLogout() {
  await fetch(`${API_BASE}/logout`, { method: 'GET', credentials: 'include' });
  state.currentUser = null;
  showUserArea(false);
  setStatus('Logged out.');
  window.location.href = 'home.html';
}

async function loadAlbums() {
  const container = document.getElementById('albums-list');
  if (!container) return;

  const { response, data } = await requestJson('/albums', { method: 'GET' });
  if (!response.ok) {
    setStatus(data?.message || 'Unable to load albums', 'error');
    container.innerHTML = '<p>Sign in to view your albums.</p>';
    return;
  }

  state.albums = data?.data?.albums || [];
  if (!state.albums.length) {
    container.innerHTML = '<p>No albums yet. Create one above.</p>';
    return;
  }

  container.innerHTML = state.albums.map(album => `
    <article class="card">
      <h3>${album.title}</h3>
      <p>${album.artist || 'Unknown artist'}</p>
      <p>Year: ${album.year || 'Unknown'}</p>
      <a href="album-detail.html?albumID=${album.albumID}">View details</a>
    </article>
  `).join('');
}

async function handleAlbumCreate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    title: form.title.value,
    artist: form.artist.value,
    year: form.year.value ? Number(form.year.value) : null
  };

  const { response, data } = await requestJson('/albums', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (response.ok) {
    form.reset();
    setStatus(data?.message || 'Album created');
    await loadAlbums();
  } else {
    setStatus(data?.message || 'Unable to create album', 'error');
  }
}

async function loadAlbumDetail() {
  const container = document.getElementById('album-detail');
  const songList = document.getElementById('songs-list');
  const params = new URLSearchParams(window.location.search);
  const albumId = params.get('albumID');
  if (!container || !songList || !albumId) {
    return;
  }

  const albumResponse = await requestJson(`/albums/${albumId}`, { method: 'GET' });
  if (!albumResponse.response.ok) {
    container.innerHTML = '<p>Album not found.</p>';
    return;
  }

  const album = albumResponse.data?.data?.album;
  container.innerHTML = `
    <h2>${album.title}</h2>
    <p>${album.artist || 'Unknown artist'}</p>
    <p>Year: ${album.year || 'Unknown'}</p>
  `;

  const songsResponse = await requestJson(`/albums/${albumId}/songs`, { method: 'GET' });
  if (!songsResponse.response.ok) {
    songList.innerHTML = '<p>Unable to load songs.</p>';
    return;
  }

  state.songs[albumId] = songsResponse.data?.data?.songs || [];
  if (!state.songs[albumId].length) {
    songList.innerHTML = '<p>No songs yet.</p>';
    return;
  }

  songList.innerHTML = state.songs[albumId].map(song => `
    <article class="card">
      <h3>${song.title}</h3>
      <p>Track: ${song.track ?? 'n/a'}</p>
      <p>Length: ${song.length ?? 'n/a'} seconds</p>
    </article>
  `).join('');
}

async function handleSongCreate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const params = new URLSearchParams(window.location.search);
  const albumId = params.get('albumID');
  if (!albumId) return;

  const payload = {
    title: form.title.value,
    track: form.track.value ? Number(form.track.value) : null,
    length: form.length.value ? Number(form.length.value) : null
  };

  const { response, data } = await requestJson(`/albums/${albumId}/songs`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (response.ok) {
    form.reset();
    setStatus(data?.message || 'Song created');
    await loadAlbumDetail();
  } else {
    setStatus(data?.message || 'Unable to create song', 'error');
  }
}

function bindPageHandlers() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const albumForm = document.getElementById('album-form');
  const songForm = document.getElementById('song-form');
  const logoutButton = document.getElementById('logout-btn');

  if (loginForm) {
    loginForm.username = loginForm.querySelector('#login-username');
    loginForm.password = loginForm.querySelector('#login-password');
    loginForm.addEventListener('submit', handleLogin);
  }

  if (registerForm) {
    registerForm.username = registerForm.querySelector('#register-username');
    registerForm.email = registerForm.querySelector('#register-email');
    registerForm.password = registerForm.querySelector('#register-password');
    registerForm.confirm_password = registerForm.querySelector('#register-confirm-password');
    registerForm.addEventListener('submit', handleRegister);
  }

  if (albumForm) {
    albumForm.title = albumForm.querySelector('#album-title');
    albumForm.artist = albumForm.querySelector('#album-artist');
    albumForm.year = albumForm.querySelector('#album-year');
    albumForm.addEventListener('submit', handleAlbumCreate);
  }

  if (songForm) {
    songForm.title = songForm.querySelector('#song-title');
    songForm.track = songForm.querySelector('#song-track');
    songForm.length = songForm.querySelector('#song-length');
    songForm.addEventListener('submit', handleSongCreate);
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }
}

async function initializeApp() {
  bindPageHandlers();

  if (window.location.pathname.includes('albums.html')) {
    const loggedIn = await checkSession();
    if (loggedIn) {
      await loadAlbums();
    }
    return;
  }

  if (window.location.pathname.includes('album-detail.html')) {
    const loggedIn = await checkSession();
    if (loggedIn) {
      await loadAlbumDetail();
    }
    return;
  }

  if (window.location.pathname.includes('home.html')) {
    await checkSession();
  }
}

document.addEventListener('DOMContentLoaded', initializeApp);
