require('dotenv').config();
let GoogleGenerativeAI;
let GoogleGenAI; // optional newer SDK for image generation
try {
    ({ GoogleGenerativeAI } = require('@google/generative-ai'));
} catch (_) {
    // Defer throwing until used
}
// Lazy require axios only when needed (used for Pollinations/ComfyUI)
let axios = null;

// Helper: normalize IMAGE_PROVIDER env (strip inline comments and extra tokens)
function getImageProviderEnv() {
    const raw = String(process.env.IMAGE_PROVIDER || '').trim();
    if (!raw) return '';
    // Remove anything after a '#' (inline comment) and split by whitespace/comma
    const noComment = raw.split('#')[0].trim();
    const token = noComment.split(/[\s,]+/)[0] || '';
    return token.toLowerCase();
}

function getClient() {
    if (!GoogleGenerativeAI) throw new Error("@google/generative-ai is not installed");
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY not set');
    return new GoogleGenerativeAI(apiKey);
}

async function analyzeSentimentAndKeywords(reviewText) {
    const client = getClient();
    const model = client.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' });

    const prompt = [
        'You are a precise sentiment and keyword service.',
        'Return JSON only that matches the provided schema.',
        'Keys: sentimentScore (-1..1 float), sentimentCategory (negative|neutral|positive), keywords (3-7 lowercase concise, single words/short bigrams).',
        'Review:',
        `"""${reviewText}"""`
    ].join('\n');

    const res = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json'
        }
    });

    const text = res && res.response ? res.response.text() : '';
    let parsed = { sentimentScore: 0, sentimentCategory: 'neutral', keywords: [] };
    try { parsed = JSON.parse(text); } catch (_) { /* fall back to defaults below */ }

    // Validate and sanitize
    if (typeof parsed.sentimentScore !== 'number' || Number.isNaN(parsed.sentimentScore)) parsed.sentimentScore = 0;
    parsed.sentimentScore = Math.max(-1, Math.min(1, parsed.sentimentScore));
    if (!['negative', 'neutral', 'positive'].includes(parsed.sentimentCategory)) {
        parsed.sentimentCategory = parsed.sentimentScore > 0.2 ? 'positive' : (parsed.sentimentScore < -0.2 ? 'negative' : 'neutral');
    }
    if (!Array.isArray(parsed.keywords)) parsed.keywords = [];
    parsed.keywords = parsed.keywords
        .map(k => String(k).toLowerCase().trim())
        .filter(k => k)
        .filter((k, i, a) => a.indexOf(k) === i) // dedupe
        .slice(0, 8);

    // Heuristic fallback for keywords if model returned none
    if (parsed.keywords.length === 0) {
        parsed.keywords = extractFallbackKeywords(reviewText, 5);
    }

    // Heuristic fallback for sentiment if model didn't provide a meaningful score
    if ((parsed.sentimentScore === 0 || Number.isNaN(parsed.sentimentScore)) && reviewText && reviewText.trim().length > 0) {
        const fbScore = computeFallbackSentiment(reviewText);
        // Only override if we have a confident non-zero signal
        if (Math.abs(fbScore) >= 0.15) {
            parsed.sentimentScore = fbScore;
            parsed.sentimentCategory = fbScore > 0.2 ? 'positive' : (fbScore < -0.2 ? 'negative' : 'neutral');
        }
    }

    return parsed;
}

async function generateImageFromKeywords(keywords, outDir, baseName) {
    const prompt = `Abstract cinematic poster evoking: ${keywords.join(', ')}. High contrast, moody lighting, film grain.`;
    // Decide provider strictly by IMAGE_PROVIDER first
    const provider = getImageProviderEnv();
    if (provider === 'comfyui') {
        return await generateWithComfyUI(prompt, outDir, baseName);
    }
    throw new Error('No IMAGE_PROVIDER configured (set IMAGE_PROVIDER=comfyui to enable ComfyUI)');
}



async function generateWithComfyUI(prompt, outDir, baseName) {
    if (!axios) axios = require('axios');
    const fs = require('fs');
    const path = require('path');
    const base = (process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
    const negative = process.env.COMFYUI_NEGATIVE || 'blurry, low quality, watermark, text, deformed, extra limbs, bad anatomy';
    const workflowPath = process.env.COMFYUI_WORKFLOW_FILE || path.join(__dirname, '..', 'default.json');

    // Load user's ComfyUI workflow template and inject dynamic values
    let workflow;
    try {
        const raw = fs.readFileSync(workflowPath, 'utf-8');
        workflow = JSON.parse(raw);
    } catch (e) {
        throw new Error(`Failed to load ComfyUI workflow file at ${workflowPath}: ${e.message}`);
    }

    // Helper: find first node id by class_type
    const findNodeIdsByType = (type) => Object.keys(workflow).filter(id => workflow[id] && workflow[id].class_type === type);

    // Update KSampler parameters if envs provided (otherwise keep template values)
    const ksamplerIds = findNodeIdsByType('KSampler');
    if (ksamplerIds.length > 0) {
        const ks = workflow[ksamplerIds[0]];
        const ksInputs = ks.inputs || (ks.inputs = {});
        // Inject seed (random if not provided)
        const seed = process.env.COMFYUI_SEED ? parseInt(process.env.COMFYUI_SEED, 10) : Math.floor(Math.random() * 1e12);
        ksInputs.seed = seed;
        if (process.env.COMFYUI_STEPS) ksInputs.steps = parseInt(process.env.COMFYUI_STEPS, 10);
        if (process.env.COMFYUI_CFG) ksInputs.cfg = parseFloat(process.env.COMFYUI_CFG);
        if (process.env.COMFYUI_SAMPLER) ksInputs.sampler_name = process.env.COMFYUI_SAMPLER;
        if (process.env.COMFYUI_SCHEDULER) ksInputs.scheduler = process.env.COMFYUI_SCHEDULER;

        // Inject prompt/negative into the nodes referenced by KSampler's positive/negative
        try {
            const posRef = Array.isArray(ksInputs.positive) ? ksInputs.positive[0] : null;
            const negRef = Array.isArray(ksInputs.negative) ? ksInputs.negative[0] : null;
            if (posRef && workflow[posRef] && workflow[posRef].class_type === 'CLIPTextEncode') {
                workflow[posRef].inputs = workflow[posRef].inputs || {};
                workflow[posRef].inputs.text = prompt;
            }
            if (negRef && workflow[negRef] && workflow[negRef].class_type === 'CLIPTextEncode') {
                workflow[negRef].inputs = workflow[negRef].inputs || {};
                // Only override if env negative set, else keep template negative text
                if (process.env.COMFYUI_NEGATIVE) {
                    workflow[negRef].inputs.text = negative;
                }
            }
        } catch (_) { /* ignore prompt injection failures */ }
    }

    // Optionally override checkpoint
    const ckptEnv = process.env.COMFYUI_CKPT && process.env.COMFYUI_CKPT.trim();
    if (ckptEnv) {
        const ckptIds = findNodeIdsByType('CheckpointLoaderSimple');
        for (const id of ckptIds) {
            const node = workflow[id];
            node.inputs = node.inputs || {};
            node.inputs.ckpt_name = ckptEnv;
        }
    }

    // Update canvas size in EmptyLatentImage if envs provided
    const widthEnv = process.env.COMFYUI_WIDTH ? parseInt(process.env.COMFYUI_WIDTH, 10) : null;
    const heightEnv = process.env.COMFYUI_HEIGHT ? parseInt(process.env.COMFYUI_HEIGHT, 10) : null;
    if (widthEnv || heightEnv) {
        const latentIds = findNodeIdsByType('EmptyLatentImage');
        for (const id of latentIds) {
            const node = workflow[id];
            node.inputs = node.inputs || {};
            if (widthEnv) node.inputs.width = widthEnv;
            if (heightEnv) node.inputs.height = heightEnv;
        }
    }

    // Ensure SaveImage has a filename_prefix; use baseName if provided
    const saveIds = findNodeIdsByType('SaveImage');
    for (const id of saveIds) {
        const node = workflow[id];
        node.inputs = node.inputs || {};
        const prefix = baseName && String(baseName).trim() ? baseName : (process.env.COMFYUI_FILENAME_PREFIX || 'ComfyUI');
        node.inputs.filename_prefix = prefix;
    }

    const queueId = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const submit = await axios.post(`${base}/prompt`, { prompt: workflow, client_id: queueId }, { timeout: 60000 });
    const promptId = submit && submit.data && (submit.data.prompt_id || submit.data.promptId);
    if (!promptId) throw new Error('ComfyUI: no prompt_id returned');

    const started = Date.now();
    const timeoutMs = parseInt(process.env.COMFYUI_TIMEOUT || '180000', 10);
    let foundImage = null;
    while (Date.now() - started < timeoutMs) {
        await new Promise(r => setTimeout(r, 1000));
        const res = await axios.get(`${base}/history/${promptId}`, { timeout: 30000 }).catch(() => null);
        if (!res || !res.data) continue;
        const histItem = res.data[promptId] || res.data;
        const outputs = (histItem && histItem.outputs) || {};
        for (const nid of Object.keys(outputs)) {
            const imgs = (outputs[nid].images || []).filter(Boolean);
            if (imgs.length) { foundImage = imgs[0]; break; }
        }
        if (foundImage) break;
    }
    if (!foundImage) throw new Error('ComfyUI: generation timed out or no images');

    const filename = foundImage.filename || foundImage.file || foundImage.name;
    const subfolder = foundImage.subfolder || '';
    const type = foundImage.type || 'output';
    const viewUrl = `${base}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`;
    const imgRes = await axios.get(viewUrl, { responseType: 'arraybuffer', timeout: 60000 });
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const ext = path.extname(filename) || '.png';
    const outPath = path.join(outDir, `${baseName}${ext}`);
    fs.writeFileSync(outPath, Buffer.from(imgRes.data));
    return outPath;
}

// Simple keyword extraction fallback using stopwords and frequency
function extractFallbackKeywords(text, maxK = 5) {
    if (!text) return [];
    const stop = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'here', 'there', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'don', 'should', 'now', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'they', 'we', 'me', 'him', 'her', 'them', 'my', 'your', 'his', 'their', 'our', 'what', 'which', 'who', 'whom', 'because', 'as', 'of'
    ]);
    const words = String(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s']/g, ' ')
        .split(/\s+/)
        .map(w => w.replace(/^'+|'+$/g, ''))
        .filter(w => w && !stop.has(w) && w.length > 2 && w.length < 20);
    const freq = new Map();
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
    return [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxK)
        .map(([w]) => w);
}

module.exports = {
    analyzeSentimentAndKeywords,
    generateImageFromKeywords
};

// Simple lexicon-based sentiment as a last resort
function computeFallbackSentiment(text) {
    if (!text) return 0;
    const pos = new Set(['good', 'great', 'excellent', 'amazing', 'wonderful', 'love', 'loved', 'like', 'liked', 'awesome', 'fantastic', 'perfect', 'incredible', 'enjoy', 'enjoyed', 'best', 'brilliant', 'masterpiece', 'moving', 'powerful', 'touching', 'funny', 'hilarious', 'beautiful', 'stunning', 'solid', 'strong']);
    const neg = new Set(['bad', 'terrible', 'awful', 'boring', 'hate', 'hated', 'dislike', 'disliked', 'worse', 'worst', 'poor', 'mediocre', 'predictable', 'dull', 'weak', 'mess', 'flawed', 'disappointing', 'disappointed', 'cringe', 'stupid', 'lame', 'ugly', 'slow', 'long', 'unbearable']);
    const words = String(text).toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).map(w => w.replace(/^'+|'+$/g, '')).filter(Boolean);
    let score = 0;
    for (const w of words) {
        if (pos.has(w)) score += 1;
        if (neg.has(w)) score -= 1;
    }
    // Normalize to [-1,1] based on density of sentiment words
    const total = words.length || 1;
    const norm = Math.max(-1, Math.min(1, score / Math.sqrt(total)));
    return norm;
}
