const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
require('dotenv').config();

function getClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY not set in environment');
    }
    return new OpenAI({ apiKey });
}

/**
 * Analyze sentiment (-1..1) and extract keywords using a small JSON response.
 * Returns { sentimentScore, sentimentCategory, keywords[] }
 */
async function analyzeSentimentAndKeywords(reviewText) {
    const client = getClient();
    const system = 'You are a precise sentiment and keyword extraction service. Output strict JSON.';
    const user = `Analyze the following movie review.\nReturn JSON with keys: sentimentScore (-1..1 float), sentimentCategory (negative|neutral|positive), keywords (3-7 concise, lowercase, single or two-word phrases).\nReview:\n"""${reviewText}\n"""`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
    });

    let parsed = { sentimentScore: 0, sentimentCategory: 'neutral', keywords: [] };
    try {
        parsed = JSON.parse(response.choices[0].message.content);
    } catch (e) {
        // keep defaults
    }

    // Clamp and normalize
    if (typeof parsed.sentimentScore !== 'number' || Number.isNaN(parsed.sentimentScore)) parsed.sentimentScore = 0;
    parsed.sentimentScore = Math.max(-1, Math.min(1, parsed.sentimentScore));
    if (!['negative', 'neutral', 'positive'].includes(parsed.sentimentCategory)) parsed.sentimentCategory = parsed.sentimentScore > 0.2 ? 'positive' : (parsed.sentimentScore < -0.2 ? 'negative' : 'neutral');
    if (!Array.isArray(parsed.keywords)) parsed.keywords = [];
    parsed.keywords = parsed.keywords.map(k => String(k).toLowerCase()).slice(0, 8);
    return parsed;
}

/**
 * Generate an image using OpenAI Images from keyword prompt and save to file.
 * Returns saved file path.
 */
async function generateImageFromKeywords(keywords, outDir, baseName) {
    const client = getClient();
    const prompt = `Abstract cinematic poster evoking: ${keywords.join(', ')}. High contrast, moody lighting, film grain.`;

    // Pick a supported size; allow override via env OPENAI_IMAGE_SIZE (1024x1024 | 1024x1536 | 1536x1024 | auto)
    const size = process.env.OPENAI_IMAGE_SIZE && ['1024x1024', '1024x1536', '1536x1024', 'auto'].includes(process.env.OPENAI_IMAGE_SIZE)
        ? process.env.OPENAI_IMAGE_SIZE
        : '1024x1024';

    const res = await client.images.generate({
        model: 'gpt-image-1',
        prompt,
        size,
    });

    const b64 = res.data[0].b64_json;
    const buf = Buffer.from(b64, 'base64');
    const file = path.join(outDir, `${baseName}.png`);
    fs.writeFileSync(file, buf);
    return file;
}

module.exports = {
    analyzeSentimentAndKeywords,
    generateImageFromKeywords,
};
