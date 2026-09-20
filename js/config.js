// SpillGuard client configuration
// Add your Mapbox Access Token here to use Mapbox Dark tiles on the dashboard.
// Get a token at https://account.mapbox.com/
window.MAPBOX_TOKEN = '';

// Optionally set a Mapbox style id. Default is 'mapbox/dark-v10'.
window.MAPBOX_STYLE = 'mapbox/dark-v10';

// MapTiler satellite/hybrid tiles are used when this key is configured.
window.MAPTILER_KEY = '6Ai35tAGTZpCMYQra61M';

// Express API origin. Vercel uses same-origin /api routes; local development
// uses the standalone Express server on port 3000.
window.API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
	? 'http://localhost:3000'
	: '';
window.SPILLGUARD_API_BASE = window.API_BASE_URL;

// If you prefer other providers, leave MAPBOX_TOKEN empty to use the built-in CARTO dark tiles.
