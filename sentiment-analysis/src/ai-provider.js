require('dotenv').config();

// Gemini (primary)
let gemini = null;
try { gemini = require('./gemini-utils'); } catch (_) { /* optional */ }


function getProviderName() {
    const name = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
    if (['gemini', 'banana'].includes(name)) return name;
    return 'gemini';
}

function getProvider() {
    const name = getProviderName();
    switch (name) {
        case 'gemini':
            if (gemini) return gemini;
            throw new Error('Gemini provider requested but not available');
        default:
            if (gemini) return gemini;
            throw new Error('No AI providers available');
    }
}

module.exports = {
    getProviderName,
    getProvider
};
