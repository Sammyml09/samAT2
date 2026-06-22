// Secure Software App - JS for index and main page
// Author: Sam Lucas
// Email: sam.lucas5@education.nsw.gov.au
// Date: March 16, 2025
//
// Purpose: 
// Client-side form validation, real-time requirement feedback, alert system,
//  AJAX form submissions for authentication and account management
//

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Alert system
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

// Username validation
function validateUsername(username) {
  const requirements = {
    length: username.length >= 3,
    lettersOnly: /^[a-zA-Z]*$/.test(username)
  };
  return requirements;
}

// Live display of Username requirements
function updateUsernameRequirements(requirements) {
  const userLength = document.getElementById('user-length');
  const userLetters = document.getElementById('user-letters');
  
  if (userLength) {
    userLength.innerHTML = requirements.length ? '✓ At least 3 characters' : '✗ At least 3 characters';
    userLength.style.color = requirements.length ? 'var(--success-color)' : 'var(--text-secondary)';
  }
  
  if (userLetters) {
    userLetters.innerHTML = requirements.lettersOnly ? '✓ Letters only (A-Z, a-z)' : '✗ Letters only (A-Z, a-z)';
    userLetters.style.color = requirements.lettersOnly ? 'var(--success-color)' : 'var(--text-secondary)';
  }
}

// Password validation
function validatePassword(password) {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /[0-9]/.test(password)
  };
  return requirements;
}

// Live display of Password requirements
function updatePasswordRequirements(requirements) {
  const reqLength = document.getElementById('req-length');
  const reqUpper = document.getElementById('req-upper');
  const reqLower = document.getElementById('req-lower');
  const reqDigit = document.getElementById('req-digit');
  
  if (reqLength) {
    reqLength.innerHTML = requirements.length ? '✓ At least 8 characters' : '✗ At least 8 characters';
    reqLength.style.color = requirements.length ? 'var(--success-color)' : 'var(--text-secondary)';
  }
  
  if (reqUpper) {
    reqUpper.innerHTML = requirements.uppercase ? '✓ One uppercase letter' : '✗ One uppercase letter';
    reqUpper.style.color = requirements.uppercase ? 'var(--success-color)' : 'var(--text-secondary)';
  }
  
  if (reqLower) {
    reqLower.innerHTML = requirements.lowercase ? '✓ One lowercase letter' : '✗ One lowercase letter';
    reqLower.style.color = requirements.lowercase ? 'var(--success-color)' : 'var(--text-secondary)';
  }
  
  if (reqDigit) {
    reqDigit.innerHTML = requirements.digit ? '✓ One number' : '✗ One number';
    reqDigit.style.color = requirements.digit ? 'var(--success-color)' : 'var(--text-secondary)';
  }
}

// Toggle between login and register forms
function toggleAuthForm(form) {
  const loginSection = document.getElementById('loginSection');
  const registerSection = document.getElementById('registerSection');
  
  if (form === 'register') {
    loginSection?.classList.remove('active');
    registerSection?.classList.add('active');
  } else {
    loginSection?.classList.add('active');
    registerSection?.classList.remove('active');
  }
}

// Close modal function
function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove('active');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const changePasswordForm = document.getElementById('changePasswordForm');
  const changeEmailForm = document.getElementById('changeEmailForm');
  const logoutBtn = document.getElementById('logoutBtn');
  
  // Set form actions and methods
  if (loginForm) {
    loginForm.action = '/api/login';
    loginForm.method = 'POST';
  }
  
  if (registerForm) {
    registerForm.action = '/api/register';
    registerForm.method = 'POST';
  }
  
  // Username validation for registration form
  const registerUsername = document.getElementById('registerUsername');
  if (registerUsername) {
    registerUsername.addEventListener('input', () => {
      const requirements = validateUsername(registerUsername.value);
      updateUsernameRequirements(requirements);
    });
  }
  
  // Password validation for registration form
  const registerPassword = document.getElementById('registerPassword');
  if (registerPassword) {
    registerPassword.addEventListener('input', () => {
      const requirements = validatePassword(registerPassword.value);
      updatePasswordRequirements(requirements);
    });
  }
  
  // Password validation for change password form
  const newPassword = document.getElementById('newPassword');
  if (newPassword) {
    newPassword.addEventListener('input', () => {
      const requirements = validatePassword(newPassword.value);
      updatePasswordRequirements(requirements);
    });
  }
  
  // Validate form submission for registration
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      const username = document.getElementById('registerUsername').value;
      const password = document.getElementById('registerPassword').value;
      const confirmPassword = document.getElementById('registerPasswordConfirm').value;
      
      const usernameReq = validateUsername(username);
      const usernameValid = usernameReq.length && usernameReq.lettersOnly;
      
      if (!usernameValid) {
        e.preventDefault();
        showAlert('Username must be at least 3 characters with letters only (A-Z, a-z)', 'error');
        return;
      }
      
      const requirements = validatePassword(password);
      const isValid = requirements.length && requirements.uppercase && 
                     requirements.lowercase && requirements.digit;
      
      if (!isValid) {
        e.preventDefault();
        showAlert('Password must be at least 8 characters with uppercase, lowercase, and numbers', 'error');
        return;
      }
      
      if (password !== confirmPassword) {
        e.preventDefault();
        showAlert('Passwords do not match', 'error');
        return;
      }
    });
  }
  
  // Validate form submission for change password
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmNewPassword').value;
      const oldPassword = document.getElementById('oldPassword').value;
      
      const requirements = validatePassword(newPassword);
      const isValid = requirements.length && requirements.uppercase && 
                     requirements.lowercase && requirements.digit;
      
      if (!isValid) {
        showAlert('New password must be at least 8 characters with uppercase, lowercase, and numbers', 'error');
        return;
      }
      
      if (newPassword !== confirmPassword) {
        showAlert('New passwords do not match', 'error');
        return;
      }
      
      if (newPassword === oldPassword) {
        showAlert('New password must be different from old password', 'error');
        return;
      }
      
      // Submit via AJAX
      try {
        const formData = new FormData(changePasswordForm);
        const response = await fetch('/api/change-password', {
          method: 'POST',
          body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
          showAlert(data.message, 'success');
          changePasswordForm.reset();
          // Reset password requirements display
          document.getElementById('passwordRequirements').innerHTML = `
            <div id="req-length" style="color: var(--text-secondary);">✗ At least 8 characters</div>
            <div id="req-upper" style="color: var(--text-secondary);">✗ One uppercase letter</div>
            <div id="req-lower" style="color: var(--text-secondary);">✗ One lowercase letter</div>
            <div id="req-digit" style="color: var(--text-secondary);">✗ One number</div>
          `;
        } else {
          showAlert(data.message, 'error');
        }
      } catch (error) {
        console.error('Error:', error);
        showAlert('An error occurred. Please try again.', 'error');
      }
    });
  }
  
  // Validate form submission for change email
  if (changeEmailForm) {
    changeEmailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const newEmail = document.getElementById('newEmail').value;
      const password = document.getElementById('emailPassword').value;
      
      if (!newEmail || !password) {
        showAlert('All fields are required', 'error');
        return;
      }
      
      if (!newEmail.includes('@') || !newEmail.includes('.')) {
        showAlert('Invalid email format', 'error');
        return;
      }
      
      // Submit via AJAX
      try {
        const formData = new FormData(changeEmailForm);
        const response = await fetch('/api/change-email', {
          method: 'POST',
          body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
          showAlert(data.message, 'success');
          changeEmailForm.reset();
        } else {
          showAlert(data.message, 'error');
        }
      } catch (error) {
        console.error('Error:', error);
        showAlert('An error occurred. Please try again.', 'error');
      }
    });
  }
  
  // Logout button
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to logout?')) {
        location.href = '/api/logout';
      }
    });
  }
  
  // Toggle buttons
  document.getElementById('toggleToRegister')?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleAuthForm('register');
  });
  
  document.getElementById('toggleToLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleAuthForm('login');
  });
});

// ============================================
// Album Management Scripts
// ============================================

const API_BASE = '/api';
let appState = {
    albums: [],
    filteredAlbums: [],
    currentUser: null
};

// Initialize albums on page load (only if on albums page)
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize album features if on the albums page
    if (document.getElementById('addAlbumBtn') || document.getElementById('albumsGrid')) {
        setupAlbumEventListeners();
        loadAlbums();
    }
});

function setupAlbumEventListeners() {
    // Add album button
    const addBtn = document.getElementById('addAlbumBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const modal = document.getElementById('addAlbumModal');
            if (modal) modal.classList.add('active');
        });
    }

    // Filter button
    const filterBtn = document.getElementById('filterBtn');
    if (filterBtn) {
        filterBtn.addEventListener('click', performFilter);
    }

    // Sort button
    const sortBtn = document.getElementById('sortBtn');
    if (sortBtn) {
        sortBtn.addEventListener('click', performSort);
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) {
                window.location.href = '/api/logout';
            }
        });
    }

    // Add album form
    const addAlbumForm = document.getElementById('addAlbumForm');
    if (addAlbumForm) {
        addAlbumForm.onsubmit = handleAddAlbum;
    }
}

// Load all albums for current user
async function loadAlbums() {
    try {
        const response = await fetch(`${API_BASE}/albums`, {
            method: 'GET',
            credentials: 'include'
        });
        const data = await response.json();

        if (data.success && data.data && data.data.albums) {
            appState.albums = data.data.albums;
            appState.filteredAlbums = [...appState.albums];
            renderAlbums();
        } else if (!data.success && response.status === 401) {
            // Not logged in, redirect to home
            window.location.href = '/';
        } else {
            showError('Failed to load albums');
        }
    } catch (error) {
        console.error('Error loading albums:', error);
        showError('Error loading albums: ' + error.message);
    }
}

// Render albums grid
function renderAlbums() {
    const grid = document.getElementById('albumsGrid');
    if (!grid) return;

    if (!appState.filteredAlbums || appState.filteredAlbums.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 2rem;">No albums yet. Click "+ Add Album" to create one!</p>';
        return;
    }

    grid.innerHTML = appState.filteredAlbums.map(album => `
        <div class="card" style="padding: 1.5rem; cursor: pointer; position: relative;" onclick="goToAlbum('${album.albumID}')">
            <div style="font-size: 3rem; text-align: center; margin-bottom: 1rem;">🎵</div>
            <h3>${escapeHtml(album.title)}</h3>
            <p><strong>Artist:</strong> ${escapeHtml(album.artist || 'Unknown')}</p>
            <p><strong>Year:</strong> ${album.year || 'Unknown'}</p>
            ${album.comment ? `<p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;">${escapeHtml(album.comment.substring(0, 50))}...</p>` : ''}
            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                <button class="btn btn-small" onclick="editAlbum(event, '${album.albumID}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteAlbum(event, '${album.albumID}')">Delete</button>
            </div>
        </div>
    `).join('');
}

// Go to album detail page
function goToAlbum(albumId) {
    window.location.href = `/album-detail?id=${albumId}`;
}

// Handle add album form submission
async function handleAddAlbum(event) {
    event.preventDefault();
    
    const title = document.getElementById('albumName')?.value?.trim();
    const artist = document.getElementById('artistName')?.value?.trim();
    const year = document.getElementById('releaseYear')?.value;
    const comment = document.getElementById('albumComment')?.value?.trim() || '';

    if (!title || !artist) {
        showError('Title and artist are required');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/albums`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                artist,
                year: year ? parseInt(year) : null,
                comment
            })
        });
        const data = await response.json();

        if (data.success) {
            showSuccess('Album created!');
            document.getElementById('addAlbumForm').reset();
            closeModal('addAlbumModal');
            await loadAlbums();
        } else {
            showError(data.message || 'Failed to create album');
        }
    } catch (error) {
        console.error('Error creating album:', error);
        showError('Error: ' + error.message);
    }
}

// Edit album
async function editAlbum(event, albumId) {
    event.stopPropagation();
    
    const album = appState.albums.find(a => a.albumID === albumId);
    if (!album) return;

    const newTitle = prompt('Enter new album title:', album.title);
    if (newTitle === null) return;

    try {
        const response = await fetch(`${API_BASE}/albums/${albumId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
        });
        const data = await response.json();

        if (data.success) {
            showSuccess('Album updated!');
            await loadAlbums();
        } else {
            showError(data.message || 'Failed to update album');
        }
    } catch (error) {
        console.error('Error updating album:', error);
        showError('Error: ' + error.message);
    }
}

// Delete album
async function deleteAlbum(event, albumId) {
    event.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this album? This cannot be undone.')) return;

    try {
        const response = await fetch(`${API_BASE}/albums/${albumId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await response.json();

        if (data.success) {
            showSuccess('Album deleted!');
            await loadAlbums();
        } else {
            showError(data.message || 'Failed to delete album');
        }
    } catch (error) {
        console.error('Error deleting album:', error);
        showError('Error: ' + error.message);
    }
}

// Perform filter
function performFilter() {
    const filterType = document.getElementById('filterType')?.value;
    const filterValue = document.getElementById('filterValue')?.value?.toLowerCase() || '';

    if (!filterType || !filterValue) {
        appState.filteredAlbums = [...appState.albums];
    } else {
        appState.filteredAlbums = appState.albums.filter(album => {
            const field = album[filterType];
            return field ? field.toString().toLowerCase().includes(filterValue) : false;
        });
    }
    renderAlbums();
}

// Perform sort
function performSort() {
    const sortType = document.getElementById('sortType')?.value;

    if (!sortType) return;

    const sorted = [...appState.filteredAlbums];
    
    switch(sortType) {
        case 'title-asc':
            sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            break;
        case 'title-desc':
            sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
            break;
        case 'artist':
            sorted.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
            break;
        case 'year-newest':
            sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
            break;
        case 'year-oldest':
            sorted.sort((a, b) => (a.year || 0) - (b.year || 0));
            break;
    }
    
    appState.filteredAlbums = sorted;
    renderAlbums();
}

// Close modal
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

// Show error message
function showError(message) {
    console.error('Error:', message);
    showAlert(message, 'error');
}

// Show success message
function showSuccess(message) {
    console.log('Success:', message);
    showAlert(message, 'success');
}
