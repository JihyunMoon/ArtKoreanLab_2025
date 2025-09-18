const { getSentiment, getSentimentChat, getSentimentScore, analyzeBatchSentiment, analyzeIndividualReviews, switchableAnalyzer, customLoopAnalyzer, analysisPresets, loadLocalTextFiles, scrapeIMDBReviews, scrapeRottenTomatoesReviews, scrapeWebContent } = require('./analyzers');

async function analyzeLocalFiles() {
    console.log('\n📁 Attempting to analyze local files...');
    const localTexts = await loadLocalTextFiles({ limit: 10, offset: 0 });
    if (localTexts.length === 0) {
        console.log('   No local files to analyze.\n');
        return null;
    }
    console.log(`   Analyzing ${localTexts.length} local files...`);
    const results = await analyzeBatchSentiment(localTexts, { numerical: true, includeIndividual: true });
    console.log('✅ Local file analysis complete!\n');
    return results;
}

async function analyzeWebReviews() {
    console.log('🌐 Attempting web review analysis...');
    try {
        const imdbReviews = await scrapeIMDBReviews('tt0111161', { limit: 5 });
        if (imdbReviews.length > 0) {
            console.log(`   Analyzing ${imdbReviews.length} web reviews...`);
            const results = await analyzeBatchSentiment(imdbReviews, { numerical: true, includeIndividual: true });
            console.log('✅ Web review analysis complete!\n');
            return results;
        }
    } catch (error) {
        console.log(`⚠️  Web scraping failed: ${error.message}`);
        console.log('   This is normal - many sites block automated access.\n');
    }
    return null;
}

async function manualSentimentTest() {
    console.log('🧪 Manual sentiment test with sample reviews...');
    const testReviews = [
        'This movie was absolutely fantastic! The acting was superb and the plot kept me engaged throughout.',
        'Terrible film. Waste of time and money. Poor acting and boring storyline.',
        'It was an okay movie. Nothing special but not terrible either.'
    ];
    const scores = [];
    console.log(`   Testing ${testReviews.length} sample reviews...`);
    for (const review of testReviews) {
        const score = await getSentimentScore(review);
        scores.push(score);
        console.log(`   - "${review.substring(0, 50)}..." → Score: ${score}`);
    }
    console.log('✅ Manual sentiment test complete!\n');
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
