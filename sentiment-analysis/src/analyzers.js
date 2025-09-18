const { getSentiment, getSentimentChat, getSentimentScore } = require('./sentimentCore');
const { loadLocalTextFiles } = require('./loaders');
const { scrapeIMDBReviews, scrapeRottenTomatoesReviews, scrapeWebContent, pickRandomImdbMovieIdFromWeb, pickRandomRtMovieUrlFromWeb } = require('./scrapers');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function analyzeBatchSentiment(textData, options = {}) {
    const { numerical = true, includeIndividual = true } = options;
    const results = { summary: { totalTexts: textData.length, averageScore: 0, positiveCount: 0, negativeCount: 0, neutralCount: 0 }, individual: [] };
    let totalScore = 0;
    for (let i = 0; i < textData.length; i++) {
        const item = textData[i];
        try {
            const score = numerical ? await getSentimentScore(item.text) : await getSentimentChat(item.text);
            const numScore = typeof score === 'number' ? score : (score.toLowerCase().includes('positive') ? 0.7 : score.toLowerCase().includes('negative') ? -0.7 : 0);
            totalScore += numScore;
            if (numScore > 0.1) results.summary.positiveCount++; else if (numScore < -0.1) results.summary.negativeCount++; else results.summary.neutralCount++;
            if (includeIndividual) results.individual.push({ filename: item.filename || `item_${i}`, text: item.text.substring(0, 100) + '...', score: numScore, sentiment: numScore > 0.1 ? 'Positive' : numScore < -0.1 ? 'Negative' : 'Neutral', source: item.source || 'unknown' });
            await sleep(500);
        } catch (error) {
            if (includeIndividual) results.individual.push({ filename: item.filename || `item_${i}`, text: item.text.substring(0, 100) + '...', score: 0, sentiment: 'Error', error: error.message, source: item.source || 'unknown' });
        }
    }
    results.summary.averageScore = totalScore / textData.length;
    return results;
}

async function analyzeIndividualReviews(options = {}) {
    const { source = 'local', limit = 5, offset = 0, movieUrl = '', movieId = '', showProgress = true } = options;
    let reviews = [];
    switch (source.toLowerCase()) {
        case 'local':
            reviews = await loadLocalTextFiles({ limit, offset });
            break;
        case 'imdb':
            if (movieId) reviews = await scrapeIMDBReviews(movieId, { limit });
            else if (movieUrl) {
                const idMatch = movieUrl.match(/\/title\/(tt\d+)/);
                if (idMatch) reviews = await scrapeIMDBReviews(idMatch[1], { limit });
                else throw new Error('Invalid IMDB URL or missing movie ID');
            } else throw new Error('IMDB source requires movieId or movieUrl');
            break;
        case 'rottentomatoes':
            if (!movieUrl) throw new Error('Rotten Tomatoes source requires movieUrl');
            reviews = await scrapeRottenTomatoesReviews(movieUrl, { limit });
            break;
        default:
            throw new Error(`Unsupported source: ${source}. Use 'local', 'imdb', or 'rottentomatoes'`);
    }
    const results = [];
    for (let i = 0; i < reviews.length; i++) {
        const review = reviews[i];
        try {
            const sentimentScore = await getSentimentScore(review.text);
            let sentimentCategory = 'Neutral';
            if (sentimentScore > 0.1) sentimentCategory = 'Positive';
            else if (sentimentScore < -0.1) sentimentCategory = 'Negative';
            results.push({ index: i + 1, filename: review.filename || `review_${i + 1}`, reviewer: review.reviewer || 'Anonymous', originalRating: review.rating || 'N/A', text: review.text, sentimentScore, sentimentCategory, source: review.source || source, url: review.url || 'N/A' });
            if (showProgress && i < reviews.length - 1) await sleep(500);
        } catch (error) {
            results.push({ index: i + 1, filename: review.filename || `review_${i + 1}`, reviewer: review.reviewer || 'Anonymous', originalRating: review.rating || 'N/A', text: review.text, sentimentScore: 0, sentimentCategory: 'Error', error: error.message, source: review.source || source, url: review.url || 'N/A' });
        }
    }
    return results;
}

async function switchableAnalyzer(options = {}) {
    const { mode = 'auto', limit = 5, offset = 0, movieId = 'tt0111161', movieUrl = 'https://www.rottentomatoes.com/m/the_shawshank_redemption', showProgress = true, onlineSources = ['imdb'] } = options;
    const results = { mode, local: [], online: { imdb: [], rottentomatoes: [] }, summary: { totalReviews: 0, localCount: 0, onlineCount: 0, averageScore: 0, distribution: { positive: 0, negative: 0, neutral: 0, errors: 0 } } };
    const shouldAnalyzeLocal = mode === 'local' || mode === 'both' || mode === 'auto';
    const shouldAnalyzeOnline = mode === 'online' || mode === 'both' || mode === 'auto';
    if (shouldAnalyzeLocal) {
        results.local = await analyzeIndividualReviews({ source: 'local', limit, offset, showProgress });
        results.summary.localCount = results.local.length;
    }
    if (shouldAnalyzeOnline) {
        if (onlineSources.includes('imdb')) results.online.imdb = await analyzeIndividualReviews({ source: 'imdb', movieId, limit, showProgress });
        if (onlineSources.includes('rottentomatoes')) results.online.rottentomatoes = await analyzeIndividualReviews({ source: 'rottentomatoes', movieUrl, limit, showProgress });
        results.summary.onlineCount = results.online.imdb.length + results.online.rottentomatoes.length;
    }
    const allReviews = [...results.local, ...results.online.imdb, ...results.online.rottentomatoes];
    results.summary.totalReviews = allReviews.length;
    const valid = allReviews.filter(r => r.sentimentCategory !== 'Error');
    if (valid.length > 0) {
        results.summary.averageScore = valid.reduce((s, r) => s + r.sentimentScore, 0) / valid.length;
        results.summary.distribution.positive = valid.filter(r => r.sentimentCategory === 'Positive').length;
        results.summary.distribution.negative = valid.filter(r => r.sentimentCategory === 'Negative').length;
        results.summary.distribution.neutral = valid.filter(r => r.sentimentCategory === 'Neutral').length;
    }
    results.summary.distribution.errors = allReviews.filter(r => r.sentimentCategory === 'Error').length;
    return results;
}

async function customLoopAnalyzer(options = {}) {
    const { mode = 'both', loopCount = 1, continuous = false, loopDelayMs = 1000, randomizeOnline = false, imdbPool = [], rtPool = [], limit = 5, offset = 0, movieId = 'tt0111161', movieUrl = 'https://www.rottentomatoes.com/m/the_shawshank_redemption', showProgress = true, onlineSources = ['imdb'] } = options;
    let runtimeConfig = null; try { runtimeConfig = require('../config'); } catch (_) { }
    const runs = []; const aggregate = { totalReviews: 0, localCount: 0, onlineCount: 0, averageScore: 0, distribution: { positive: 0, negative: 0, neutral: 0, errors: 0 } };
    let iteration = 0; const shouldContinue = () => continuous || iteration < loopCount;
    while (shouldContinue()) {
        iteration += 1;
        let chosenMovieId = movieId; let chosenMovieUrl = movieUrl;
        if (randomizeOnline) {
            if (imdbPool.length > 0) chosenMovieId = pickRandom(imdbPool);
            else if (onlineSources.includes('imdb') && runtimeConfig) {
                const pick = await pickRandomImdbMovieIdFromWeb(runtimeConfig); if (pick) chosenMovieId = pick;
            }
            if (rtPool.length > 0) chosenMovieUrl = pickRandom(rtPool);
            else if (onlineSources.includes('rottentomatoes') && runtimeConfig) {
                const pickRt = await pickRandomRtMovieUrlFromWeb(runtimeConfig); if (pickRt) chosenMovieUrl = pickRt;
            }
        }
        const iterResult = await switchableAnalyzer({ mode, limit, offset, movieId: chosenMovieId, movieUrl: chosenMovieUrl, showProgress, onlineSources });
        runs.push({ iteration, movieId: chosenMovieId, movieUrl: chosenMovieUrl, result: iterResult });
        aggregate.totalReviews += iterResult.summary.totalReviews || 0;
        aggregate.localCount += iterResult.summary.localCount || 0;
        aggregate.onlineCount += iterResult.summary.onlineCount || 0;
        const allIter = [...iterResult.local, ...iterResult.online.imdb, ...iterResult.online.rottentomatoes];
        const validIter = allIter.filter(r => r.sentimentCategory !== 'Error');
        if (validIter.length > 0) {
            const sumScores = validIter.reduce((s, r) => s + r.sentimentScore, 0);
            const prevValidTotal = aggregate.distribution.positive + aggregate.distribution.negative + aggregate.distribution.neutral;
            const newValidTotal = prevValidTotal + validIter.length;
            const prevAvgTimesCount = aggregate.averageScore * prevValidTotal;
            aggregate.averageScore = newValidTotal > 0 ? (prevAvgTimesCount + sumScores) / newValidTotal : aggregate.averageScore;
            aggregate.distribution.positive += validIter.filter(r => r.sentimentCategory === 'Positive').length;
            aggregate.distribution.negative += validIter.filter(r => r.sentimentCategory === 'Negative').length;
            aggregate.distribution.neutral += validIter.filter(r => r.sentimentCategory === 'Neutral').length;
        }
        aggregate.distribution.errors += allIter.filter(r => r.sentimentCategory === 'Error').length;
        if (continuous || iteration < loopCount) await sleep(loopDelayMs);
    }
    return { iterations: iteration, mode, randomizeOnline, runs, summary: aggregate };
}

const analysisPresets = {
    async localOnly(limit = 10, offset = 0) { return await switchableAnalyzer({ mode: 'local', limit, offset, showProgress: true }); },
    async onlineOnly(movieId = 'tt0111161', sources = ['imdb'], limit = 5) { return await switchableAnalyzer({ mode: 'online', movieId, onlineSources: sources, limit, showProgress: true }); },
    async compareLocalVsOnline(movieId = 'tt0111161', limit = 5) { return await switchableAnalyzer({ mode: 'both', movieId, onlineSources: ['imdb'], limit, showProgress: true }); },
    async fullAnalysis(movieId = 'tt0111161', limit = 3) { return await switchableAnalyzer({ mode: 'both', movieId, onlineSources: ['imdb', 'rottentomatoes'], limit, showProgress: true }); },
    async auto(limit = 5) { return await switchableAnalyzer({ mode: 'auto', limit, showProgress: true }); },
    async onlineRandom(loopCount = 3, limit = 2) { return await customLoopAnalyzer({ mode: 'online', loopCount, randomizeOnline: true, onlineSources: ['imdb', 'rottentomatoes'], limit, showProgress: true }); },
    async customLoop(userOptions = {}) { return await customLoopAnalyzer(userOptions); }
};

module.exports = {
    getSentiment,
    getSentimentChat,
    getSentimentScore,
    analyzeBatchSentiment,
    analyzeIndividualReviews,
    switchableAnalyzer,
    customLoopAnalyzer,
    analysisPresets,
    loadLocalTextFiles,
    scrapeIMDBReviews,
    scrapeRottenTomatoesReviews,
    scrapeWebContent
};
