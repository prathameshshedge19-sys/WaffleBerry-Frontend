# Waffle Berry Frontend

Waffle Berry is a vanilla HTML, CSS, and JavaScript frontend for the separate
WaffleBerry FastAPI backend.

## Current functionality

- Registration and JWT login
- Protected-page authentication checks and logout
- Personalized homepage greeting
- Conversation creation, selection, deletion, and refresh persistence
- Message history and message sending
- Deterministic first-message conversation titles returned by the backend
- Responsive, scrollable conversation sidebar
- Light and dark themes
- Disabled Google and Apple sign-in placeholders

No frontend build step or package installation is required.

## Run locally

First start `WaffleBerry_backend` and confirm this address works:

```text
http://127.0.0.1:8000/health
```

Then serve this directory with a local HTTP server. Do not open the HTML files
directly with a `file://` URL.

Examples:

```bash
python -m http.server 4173
```

or, if Node.js is installed:

```bash
npx serve .
```

Open:

```text
http://127.0.0.1:4173/login.html
```

The expected development API base URL is:

```text
http://127.0.0.1:8000/api/v1
```

## Configure the backend API URL

All API requests use the single configuration point in `js/api.js`.
Development falls back to `http://127.0.0.1:8000/api/v1`.

For deployment, define `window.WAFFLEBERRY_API_BASE_URL` before `js/api.js`
loads. For example, a hosting environment can inject:

```html
<script>
    window.WAFFLEBERRY_API_BASE_URL =
        "https://api.example.com/api/v1";
</script>
<script src="js/api.js"></script>
```

The value should include `/api/v1`. A trailing slash is accepted and removed
automatically. Never place API secrets in frontend JavaScript; the browser
stores only the authenticated user's bearer token and basic session data.

## Project structure

```text
assets/          Images and other static assets
css/style.css    Shared application styling
js/api.js        API configuration, requests, errors, and session storage
js/auth.js       Protected-page guard and logout
js/login.js      Registration and login
js/home.js       Homepage greeting and animation
js/chat.js       Conversations and messages
js/theme.js      Theme persistence
login.html       Registration and login page
home.html        Authenticated homepage
chat.html        Conversation interface
mission.html     Project mission page
```

## Deployment notes

- Serve the directory as static files over HTTPS.
- Configure the production API URL in one place as described above.
- Configure the backend CORS policy for the deployed frontend origin.
- The backend must be running and reachable from the user's browser.
- Authentication data is stored in `localStorage`; passwords are never stored
  by the frontend.
