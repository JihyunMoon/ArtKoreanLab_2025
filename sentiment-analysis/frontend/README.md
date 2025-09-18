npm# Poem Generator Frontend (Svelte + Vite)

This frontend displays two background images from `../outputs/images`, picks a keyword from `../outputs/data/*.json`, and generates a poem using Google Gemini. You can also enter your own word/feeling to generate a new poem.

## Quick start

1. Install dependencies:

```bash
cd frontend
npm install
```

2. Set your Gemini API key:

```bash
cp .env.example .env
# edit .env and set GEMINI_API_KEY
```

3. Run the dev server:

```bash
npm run dev
```

Then open the printed local URL (usually http://localhost:5173).

## Notes
- The dev server exposes two endpoints:
  - `GET /api/outputs` to load images and JSON data from `../outputs`.
  - `POST /api/poem` to call Gemini (server-side) using `GEMINI_API_KEY`.
- For production builds, ensure the server environment has `GEMINI_API_KEY` set when running `vite preview` or deploying with a Node server.

***

If you add more JSON files under `outputs/data` or images under `outputs/images`, refresh the page to see new backgrounds and keyword picks.