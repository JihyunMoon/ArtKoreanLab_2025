import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'node:fs';
import path from 'node:path';

// Helper to load images as base64 from outputs/images
function readImageAsDataUrl(filePath: string) {
  try {
    const abs = path.resolve(filePath);
    const buf = fs.readFileSync(abs);
    const ext = path.extname(abs).toLowerCase().slice(1);
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    return null;
  }
}

// Vite server middleware to expose outputs and poem generation
function attachOutputsApi(server: any, env: Record<string, string>) {
  server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url) return next();
        if (req.url.startsWith('/api/outputs')) {
          try {
            const root = server.config.root as string;
            const outputsDir = path.resolve(root, '..', 'outputs');
            const imagesDir = path.join(outputsDir, 'images');
            const dataDir = path.join(outputsDir, 'data');

            const images: string[] = [];
            if (fs.existsSync(imagesDir)) {
              for (const f of fs.readdirSync(imagesDir)) {
                const p = path.join(imagesDir, f);
                if (fs.statSync(p).isFile()) {
                  const dataUrl = readImageAsDataUrl(p);
                  if (dataUrl) images.push(dataUrl);
                }
              }
            }

            const jsonFiles: any[] = [];
            if (fs.existsSync(dataDir)) {
              for (const f of fs.readdirSync(dataDir)) {
                const p = path.join(dataDir, f);
                if (fs.statSync(p).isFile() && f.endsWith('.json')) {
                  try {
                    const raw = fs.readFileSync(p, 'utf-8');
                    const parsed = JSON.parse(raw);
                    jsonFiles.push({ file: f, data: parsed });
                  } catch {}
                }
              }
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ images, jsonFiles }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Failed to read outputs' }));
          }
          return;
        }

        if (req.url.startsWith('/api/poem') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', async () => {
            try {
              const { keyword } = JSON.parse(body || '{}');
              const apiKey = (globalThis as any).process?.env?.GEMINI_API_KEY || env.GEMINI_API_KEY || '';
              if (!apiKey) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Missing GEMINI_API_KEY' }));
                return;
              }
              // Minimal server-side call to Gemini Generative Language API
              const prompt = `Write a short free-verse poem in English inspired by the keyword: "${keyword}". 6-10 lines, evocative, no title.`;
              const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;
              const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
              });
              if (!r.ok) {
                const txt = await r.text();
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Gemini API error', details: txt }));
                return;
              }
              const j = await r.json();
              let poem = '';
              try {
                poem = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
              } catch {}
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ poem }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Failed to generate poem' }));
            }
          });
          return;
        }

        next();
      });
}

function outputsApi(env: Record<string, string>) {
  return {
    name: 'outputs-api-middleware',
    configureServer(server: any) {
      attachOutputsApi(server, env);
    },
    configurePreviewServer(server: any) {
      // Vite preview server has a similar API surface
      attachOutputsApi(server, env);
    }
  };
}

export default defineConfig(({ mode }) => {
  // Determine a root path without referencing Node typings
  const rootFromUrl = new URL('.', import.meta.url).pathname;
  const env = loadEnv(mode, rootFromUrl, '');
  return {
    plugins: [svelte(), outputsApi(env)],
    server: { port: 5173 },
    preview: { port: 5173 }
  };
});
