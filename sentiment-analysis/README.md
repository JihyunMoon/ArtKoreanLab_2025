# Sentiment Analysis: IMDB Reviews + Gemini + ComfyUI

Analyze random IMDB user reviews with Google AI (Gemini), extract sentiment and keywords, and optionally generate a cinematic image with ComfyUI — all saved into `outputs/`.

## Features

- Fetches titles and a few user reviews from IMDB for random/popular movies
- Uses Gemini (`@google/generative-ai`) to return:
  - `sentimentScore` in [-1, 1], `sentimentCategory` (negative/neutral/positive)
  - `keywords` (3–7 concise tokens)
  - Built-in keyword/sentiment fallbacks if the API is unavailable
- Optional image generation via ComfyUI with a configurable workflow (`default.json`)
- Saves JSON metadata under `outputs/data/` and images to `outputs/images/`

## Prerequisites

- Node.js 18+ recommended
- A Google AI API key (for Gemini): set one of `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- (Optional) A running ComfyUI server for image generation

## Install

```bash
# from repo root
cd sentiment-analysis
npm install
```

## Configuration

Copy the example and edit as needed:

```bash
cp .env.example .env
```
Key variables from `.env.example`:

- `AI_PROVIDER` (default `gemini`)
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- `GEMINI_MODEL` (default `gemini-2.0-flash`)
- Image generation via ComfyUI:
  - `IMAGE_PROVIDER=comfyui`
  - `COMFYUI_BASE_URL` (default `http://127.0.0.1:8188`)
  - `COMFYUI_WORKFLOW_FILE` (defaults to repo `default.json` if omitted)
  - Optional overrides: `COMFYUI_CKPT`, `COMFYUI_WIDTH`, `COMFYUI_HEIGHT`, `COMFYUI_STEPS`, `COMFYUI_CFG`, `COMFYUI_SAMPLER`, `COMFYUI_SCHEDULER`, `COMFYUI_NEGATIVE`, `COMFYUI_TIMEOUT`

Notes:

- If image generation is not desired, leave `IMAGE_PROVIDER` empty or unset. The app will skip image creation gracefully.
- The ComfyUI workflow is expected to contain nodes like `KSampler`, `CheckpointLoaderSimple`, `EmptyLatentImage`, `CLIPTextEncode`, and `SaveImage`. The code injects your prompt, sizes, and other overrides.

## Usage

The primary entry is `random-movie-analyzer.js`. Available npm scripts:

```bash
# Quick test: analyze a couple of popular movies (default)
npm start
# or
npm run random

# Full run: more movies, mixed random/popular
npm run random:full

# Stream mode: continuous loop (Ctrl+C to stop)
# Usage: npm run random:stream -- <delayMs> <reviewsPerMovie>
# Example: every 3 seconds, 1 review per movie
npm run random:stream -- 3000 1
```

Direct Node usage is also supported:

```bash
# quick mode (default if no args)
node random-movie-analyzer.js quick

# full mode with optional overrides
node random-movie-analyzer.js full 8 2  
#            ^mode            ^movieCount ^reviewsPerMovie

# stream mode: delayMs and optional reviewsPerMovie
node random-movie-analyzer.js stream 3000 1
```

## Output

Generated files go to:

- `outputs/data/*.json` — per-movie or per-review metadata
- `outputs/images/*.png` — when ComfyUI is enabled and an image is produced

Each JSON entry includes movie metadata, extracted sentiment and keywords, and the file path of any generated image.

## How it works

- `src/random-imdb-generator.js` — finds random IMDB titles (or uses a curated popular list)
- `src/imdb-scraper.js` — scrapes the movie page and a handful of user reviews
- `src/ai-provider.js` — selects the AI provider (currently Gemini)
- `src/gemini-utils.js` — calls Gemini for structured analysis; has fallbacks for sentiment/keywords
- `default.json` — a minimal ComfyUI workflow template that the app customizes per run

## Troubleshooting

- Missing API key: set `GEMINI_API_KEY` or `GOOGLE_API_KEY` in `.env`
- Network / IMDB scraping changes: retry later or adjust selectors in `src/imdb-scraper.js`
- ComfyUI timeouts: increase `COMFYUI_TIMEOUT` and ensure the server is reachable at `COMFYUI_BASE_URL`
- No images generated: confirm `IMAGE_PROVIDER=comfyui` and that `COMFYUI_WORKFLOW_FILE` points to a valid workflow; check ComfyUI server logs
- Rate limits / model errors: the code applies light fallbacks, but you may need to slow requests or handle keys with sufficient quota

## License

MIT
