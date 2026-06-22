/**
 * Album Management Scripts
 * Handles album creation, filtering, sorting, and deletion for the Music Diary PWA
 */

const API_BASE = '/api';
let appState = {
    albums: [],
    filteredAlbums: [],
    currentUser: null
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadAlbums();
});

function setupEventListeners() {
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

// Utility: Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Show error message
function showError(message) {
    console.error('Error:', message);
    alert('Error: ' + message);
}

// Show success message
function showSuccess(message) {
    console.log('Success:', message);
    alert(message);
}
