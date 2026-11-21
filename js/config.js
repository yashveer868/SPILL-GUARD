// Spill Sense client configuration
// Add your Mapbox Access Token here to use Mapbox Dark tiles on the dashboard.
// Get a token at https://account.mapbox.com/
window.MAPBOX_TOKEN = '';

// Optionally set a Mapbox style id. Default is 'mapbox/dark-v10'.
window.MAPBOX_STYLE = 'mapbox/dark-v10';

// Leave provider keys out of the frontend bundle; the map uses the CARTO fallback.
window.MAPTILER_KEY = '';

// FastAPI origin. Keep this pointed at the backend when the site is opened
// through Live Server or another static-file server.
// Empty means "use this site's origin".  This works on Vercel and avoids
// hard-coding a localhost API address in production.
window.SPILLGUARD_API_BASE = window.location.origin;

// If you prefer other providers, leave MAPBOX_TOKEN empty to use the built-in CARTO dark tiles.
