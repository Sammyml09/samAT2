/*
###############################################################################
Music Diary PWA - Service Worker 
Author: Sam Lucas
Email: sam.lucas5@education.nsw.gov.au
Date: December 5, 2025

Purpose: This service worker enables offline functionality 
for the Music Diary PWA by caching essential assets and 
handling fetch requests. It implements a cache-first strategy
for static assets and a network-first strategy for API 
calls, ensuring that users can access their music diary even
when offline.

###############################################################################
*/

// Music Diary Service Worker

const CACHE_NAME = 'music-diary-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles/myStyle.css',
  '/scripts/myScripts.js',
  '/pages/home.html',
  '/pages/albums.html',
  '/pages/album-detail.html',
  '/manifest.json'
];

// Install event - cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Caching assets...');
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.log('Some assets could not be cached:', err);
        // Continue even if some assets fail to cache
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only cache GET requests
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // Skip non-HTTP(S) requests (chrome-extension, etc.)
  if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) {
    event.respondWith(fetch(request));
    return;
  }

  // Network first for API calls, cache first for assets
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache
          return caches.match(request);
        })
    );
  } else {
    // Cache first, fallback to network
    event.respondWith(
      caches.match(request).then(response => {
        if (response) {
          return response;
        }

        return fetch(request)
          .then(response => {
            // Cache new responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });

            return response;
          })
          .catch(() => {
            // Return offline page or cached asset
            return caches.match('/index.html');
          });
      })
    );
  }
});

// Background sync for future use
self.addEventListener('sync', event => {
  if (event.tag === 'sync-albums') {
    event.waitUntil(syncAlbumData());
  }
});

async function syncAlbumData() {
  try {
    // Sync album data with server when online
    console.log('Syncing album data...');
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

// Handle messages from clients
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
