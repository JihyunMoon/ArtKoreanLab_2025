// Minimal, clean entry re-exporting the modular implementation
module.exports = require('./src/index');

// Optional: preserve direct-run demo hooks without bundling the entire logic here
if (require.main === module) {
  (async () => {
    const api = require('./src/index');
    console.log('Starting Sentiment Analysis Examples...\n');
    try {
      await api.analyzeLocalFiles();
      await api.analyzeWebReviews();
      await api.manualSentimentTest();
    } catch (e) {
      // Demo failures are non-fatal
    }
    console.log('\n=== All Examples Complete ===');
  })();
}

/**
 * Custom loop analyzer that can re-run analyses multiple times, optionally randomizing online movie selection.
 * This preserves one-by-one review processing by delegating to analyzeIndividualReviews via switchableAnalyzer.
 *
 * @param {Object} options
 * @param {('local'|'online'|'both'|'auto')} [options.mode='both'] - Which sources to analyze each loop
 * @param {number} [options.loopCount=1] - How many iterations to run (ignored if continuous=true)
 * @param {boolean} [options.continuous=false] - If true, loop indefinitely until externally terminated
 * @param {number} [options.loopDelayMs=1000] - Delay between iterations in milliseconds
 * @param {boolean} [options.randomizeOnline=false] - If true, randomly select IMDB IDs / RT URLs each iteration
 * @param {string[]} [options.imdbPool] - Pool of IMDB IDs to choose from when randomizing
 * @param {string[]} [options.rtPool] - Pool of Rotten Tomatoes URLs to choose from when randomizing
 * @param {number} [options.limit=5] - Max number of reviews per source per iteration
 * @param {number} [options.offset=0] - Offset for local file loading
 * @param {string} [options.movieId] - Default IMDB ID when not randomizing
 * @param {string} [options.movieUrl] - Default Rotten Tomatoes URL when not randomizing
 * @param {boolean} [options.showProgress=true] - Show progress logs
 * @param {Array<'imdb'|'rottentomatoes'>} [options.onlineSources=['imdb']] - Which online sources to use
 * @returns {Promise<Object>} Aggregated results across iterations with per-iteration details
 */
async function customLoopAnalyzer(options = {}) {
  const {
    mode = 'both',
    loopCount = 1,
    continuous = false,
    loopDelayMs = 1000,
    randomizeOnline = false,
    imdbPool = [
      'tt0111161', // The Shawshank Redemption
      'tt0068646', // The Godfather
      'tt0468569', // The Dark Knight
      'tt0109830', // Forrest Gump
      'tt0137523'  // Fight Club
    ],
    rtPool = [
      'https://www.rottentomatoes.com/m/the_shawshank_redemption',
      'https://www.rottentomatoes.com/m/the_godfather',
      'https://www.rottentomatoes.com/m/the_dark_knight',
      'https://www.rottentomatoes.com/m/forrest_gump',
      'https://www.rottentomatoes.com/m/fight_club'
    ],
    limit = 5,
    offset = 0,
    movieId = 'tt0111161',
    movieUrl = 'https://www.rottentomatoes.com/m/the_shawshank_redemption',
    showProgress = true,
    onlineSources = ['imdb']
  } = options;

  console.log(`\n=== Custom Loop Analyzer (Mode: ${mode.toUpperCase()}) ===`);
  if (randomizeOnline) {
    console.log('Random selection for online sources is ENABLED');
  }

  // Load configuration if available to enable dynamic random picks
  let runtimeConfig = null;
  try {
    runtimeConfig = require('./config');
  } catch (_) { }

  const runs = [];
  const aggregate = {
    totalReviews: 0,
    localCount: 0,
    onlineCount: 0,
    averageScore: 0,
    distribution: { positive: 0, negative: 0, neutral: 0, errors: 0 }
  };

  let iteration = 0;
  const shouldContinue = () => continuous || iteration < loopCount;

  while (shouldContinue()) {
    iteration += 1;
    console.log(`\n--- Iteration ${iteration} ---`);

    // Select movies for this iteration (random if requested)
    let chosenMovieId = movieId;
    let chosenMovieUrl = movieUrl;
    if (randomizeOnline) {
      if (imdbPool && imdbPool.length > 0) {
        chosenMovieId = pickRandom(imdbPool);
      } else if (onlineSources.includes('imdb') && runtimeConfig) {
        const webPicked = await pickRandomImdbMovieIdFromWeb(runtimeConfig);
        if (webPicked) chosenMovieId = webPicked;
      }

      if (rtPool && rtPool.length > 0) {
        chosenMovieUrl = pickRandom(rtPool);
      } else if (onlineSources.includes('rottentomatoes') && runtimeConfig) {
        const webPickedRt = await pickRandomRtMovieUrlFromWeb(runtimeConfig);
        if (webPickedRt) chosenMovieUrl = webPickedRt;
      }
    }

    // Run the switchable analyzer for this iteration
    const iterResult = await switchableAnalyzer({
      mode,
      limit,
      offset,
      movieId: chosenMovieId,
      movieUrl: chosenMovieUrl,
      showProgress,
      onlineSources
    });

    runs.push({
      iteration,
      movieId: chosenMovieId,
      movieUrl: chosenMovieUrl,
      result: iterResult
    });

    // Update aggregate stats
    aggregate.totalReviews += iterResult.summary.totalReviews || 0;
    aggregate.localCount += iterResult.summary.localCount || 0;
    aggregate.onlineCount += iterResult.summary.onlineCount || 0;

    // For averages, recompute across all valid reviews gathered so far
    const allIterReviews = [
      ...iterResult.local,
      ...iterResult.online.imdb,
      ...iterResult.online.rottentomatoes
    ];
    const validIter = allIterReviews.filter(r => r.sentimentCategory !== 'Error');
    if (validIter.length > 0) {
      const sumScores = validIter.reduce((sum, r) => sum + r.sentimentScore, 0);
      // Compute running average: (prevAvg * prevCount + sumScores) / newTotalCount
      const prevValidTotal = aggregate.distribution.positive + aggregate.distribution.negative + aggregate.distribution.neutral;
      const newValidTotal = prevValidTotal + validIter.length;
      const prevAvgTimesCount = aggregate.averageScore * prevValidTotal;
      aggregate.averageScore = newValidTotal > 0 ? (prevAvgTimesCount + sumScores) / newValidTotal : aggregate.averageScore;

      // Update distribution counts
      aggregate.distribution.positive += validIter.filter(r => r.sentimentCategory === 'Positive').length;
      aggregate.distribution.negative += validIter.filter(r => r.sentimentCategory === 'Negative').length;
      aggregate.distribution.neutral += validIter.filter(r => r.sentimentCategory === 'Neutral').length;
    }
    aggregate.distribution.errors += allIterReviews.filter(r => r.sentimentCategory === 'Error').length;

    // Inter-iteration delay if needed
    if (continuous || iteration < loopCount) {
      await new Promise(resolve => setTimeout(resolve, loopDelayMs));
    }
  }

  console.log(`\n=== Custom Loop Summary ===`);
  console.log(`Iterations: ${iteration}`);
  console.log(`Total Reviews: ${aggregate.totalReviews} (Local: ${aggregate.localCount}, Online: ${aggregate.onlineCount})`);
  if (aggregate.totalReviews > 0) {
    console.log(`Average Sentiment Score: ${aggregate.averageScore.toFixed(3)}`);
    console.log(`Distribution: ${aggregate.distribution.positive} Positive, ${aggregate.distribution.negative} Negative, ${aggregate.distribution.neutral} Neutral`);
    if (aggregate.distribution.errors > 0) {
      console.log(`Errors: ${aggregate.distribution.errors}`);
    }
  }

  return {
    iterations: iteration,
    mode,
    randomizeOnline,
    pools: { imdbPoolCount: imdbPool.length, rtPoolCount: rtPool.length },
    runs,
    summary: aggregate
  };
}

/**
 * Quick preset functions for common analysis scenarios
 */
const analysisPresets = {
  /**
   * Analyze only local files
   */
  async localOnly(limit = 10, offset = 0) {
    return await switchableAnalyzer({
      mode: 'local',
      limit,
      offset,
      showProgress: true
    });
  },

  /**
   * Analyze only online sources
   */
  async onlineOnly(movieId = 'tt0111161', sources = ['imdb'], limit = 5) {
    return await switchableAnalyzer({
      mode: 'online',
      movieId,
      onlineSources: sources,
      limit,
      showProgress: true
    });
  },

  /**
   * Compare local vs online for the same movie
   */
  async compareLocalVsOnline(movieId = 'tt0111161', limit = 5) {
    return await switchableAnalyzer({
      mode: 'both',
      movieId,
      onlineSources: ['imdb'],
      limit,
      showProgress: true
    });
  },

  /**
   * Comprehensive analysis from all available sources
   */
  async fullAnalysis(movieId = 'tt0111161', limit = 3) {
    return await switchableAnalyzer({
      mode: 'both',
      movieId,
      onlineSources: ['imdb', 'rottentomatoes'],
      limit,
      showProgress: true
    });
  },

  /**
   * Auto mode - tries everything and uses what works
   */
  async auto(limit = 5) {
    return await switchableAnalyzer({
      mode: 'auto',
      limit,
      showProgress: true
    });
  },

  /**
   * Online random mode - loops a few times picking random movies from pools
   */
  async onlineRandom(loopCount = 3, limit = 2) {
    return await customLoopAnalyzer({
      mode: 'online',
      loopCount,
      randomizeOnline: true,
      onlineSources: ['imdb', 'rottentomatoes'],
      limit,
      showProgress: true
    });
  },

  /**
   * Custom looping with full control over options
   */
  async customLoop(userOptions = {}) {
    return await customLoopAnalyzer(userOptions);
  }
};

/**
 * Main execution function
 */
async function main() {
  console.log('Starting Sentiment Analysis Examples...\n');

  // Run all examples
  await analyzeLocalFiles();
  await analyzeWebReviews();
  await manualSentimentTest();

  console.log('\n=== All Examples Complete ===');
  console.log('Note: Web scraping examples may fail due to website protections.');
  console.log('Local file analysis should work if unsup_test_data folder contains .txt files.');
}

// Export functions for use in other modules
module.exports = {
  getSentiment,
  getSentimentChat,
  getSentimentScore,
  loadLocalTextFiles,
  analyzeBatchSentiment,
  analyzeIndividualReviews,
  switchableAnalyzer,
  customLoopAnalyzer,
  analysisPresets,
  scrapeRottenTomatoesReviews,
  scrapeIMDBReviews,
  scrapeWebContent,
  analyzeLocalFiles,
  analyzeWebReviews,
  manualSentimentTest,
  main
};

// Run main function if this file is executed directly
if (require.main === module) {
  main();
}