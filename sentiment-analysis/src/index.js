const { getSentiment, getSentimentChat, getSentimentScore, analyzeBatchSentiment, analyzeIndividualReviews, switchableAnalyzer, customLoopAnalyzer, analysisPresets, loadLocalTextFiles, scrapeIMDBReviews, scrapeRottenTomatoesReviews, scrapeWebContent } = require('./analyzers');

async function analyzeLocalFiles() {
    const localTexts = await loadLocalTextFiles({ limit: 10, offset: 0 });
    if (localTexts.length === 0) return;
    const results = await analyzeBatchSentiment(localTexts, { numerical: true, includeIndividual: true });
    return results;
}

async function analyzeWebReviews() {
    const imdbReviews = await scrapeIMDBReviews('tt0111161', { limit: 5 });
    if (imdbReviews.length > 0) {
        return await analyzeBatchSentiment(imdbReviews, { numerical: true, includeIndividual: true });
    }
    return null;
}

async function manualSentimentTest() {
    const testReviews = [
        'This movie was absolutely fantastic! The acting was superb and the plot kept me engaged throughout.',
        'Terrible film. Waste of time and money. Poor acting and boring storyline.',
        'It was an okay movie. Nothing special but not terrible either.'
    ];
    const scores = [];
    for (const review of testReviews) scores.push(await getSentimentScore(review));
    return scores;
}

module.exports = {
    // Core
    getSentiment,
    getSentimentChat,
    getSentimentScore,
    // Analyzers
    analyzeBatchSentiment,
    analyzeIndividualReviews,
    switchableAnalyzer,
    customLoopAnalyzer,
    analysisPresets,
    // Loaders/Scrapers
    loadLocalTextFiles,
    scrapeIMDBReviews,
    scrapeRottenTomatoesReviews,
    scrapeWebContent,
    // Demos
    analyzeLocalFiles,
    analyzeWebReviews,
    manualSentimentTest
};
