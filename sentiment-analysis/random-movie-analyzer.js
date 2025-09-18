const fs = require('fs');
const path = require('path');
require('dotenv').config();
const RandomIMDBGenerator = require('./random-imdb-generator');
const { getMovieData } = require('./src/imdb-scraper');
const { analyzeSentimentAndKeywords, generateImageFromKeywords } = require('./src/openai-utils');

/**
 * Streamlined Movie Review to OSC Sender
 * 
 * Continuously gets movie reviews, analyzes sentiment, and sends via OSC
 */

class MovieReviewStreamer {
    constructor() {
        this.generator = new RandomIMDBGenerator();
        this.outputDir = path.join(__dirname, 'outputs');
        this.imageDir = path.join(this.outputDir, 'images');
        this.dataDir = path.join(this.outputDir, 'data');
        if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
        if (!fs.existsSync(this.imageDir)) fs.mkdirSync(this.imageDir, { recursive: true });
        if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
    }

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    slugify(str, fallback = 'item') {
        if (!str) return fallback;
        return String(str)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || fallback;
    }

    /**
     * Get a mix of popular and random movie IDs
     * @param {number} popularCount - Number of popular movies to include
     * @param {number} randomCount - Number of random movies to find
     * @returns {Array} - Combined array of movie IDs
     */
    async getMixedMovieIds(popularCount = 5, randomCount = 3) {
        console.log(`🎬 Building movie list: ${popularCount} popular + ${randomCount} random movies\\n`);

        // Get popular movies
        const popularMovies = this.generator.getPopularMovieIds().slice(0, popularCount);
        console.log(`✅ Popular movies: ${popularMovies.join(', ')}`);

        // Get random movies
        console.log(`\\n🎲 Finding ${randomCount} random movies...`);
        const randomMovies = await this.generator.getRandomMovieIds(randomCount, 3);
        console.log(`✅ Random movies: ${randomMovies.join(', ')}`);

        // Combine and shuffle
        const allMovies = [...popularMovies, ...randomMovies];
        return this.shuffleArray(allMovies);
    }

    // Legacy OSC flow removed; focusing on OpenAI scoring and image generation

    /**
     * Process and send a single review via OSC with immediate feedback
     * @param {Object} review - Review object with text, sentiment, etc.
     * @param {string} reviewId - Identifier for the review
     * @param {string} movieId - Movie ID
     * @param {number} currentSentCount - Current count of sent reviews
     */
    // Removed OSC-specific review sender
    /**
     * Shuffle array using Fisher-Yates algorithm
     * @param {Array} array - Array to shuffle
     * @returns {Array} - Shuffled array
     */
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Run sentiment analysis with random movies
     * @param {Object} options - Analysis options
     */
    async analyzeRandomMovies(options = {}) {
        const { movieCount = 3, popularRatio = 0.7, reviewsPerMovie = 2 } = options;
        const popularCount = Math.ceil(movieCount * popularRatio);
        const randomCount = Math.max(0, movieCount - popularCount);

        console.log('🚀 Random Movie Sentiment + Image Generation Starting...\n');
        const movieIds = await this.getMixedMovieIds(popularCount, randomCount);
        console.log(`🎯 Movie IDs: ${movieIds.join(', ')}\n`);

        const summary = [];
        for (const movieId of movieIds) {
            console.log(`🎬 Fetching data for ${movieId}...`);
            const data = await getMovieData(movieId, reviewsPerMovie);
            console.log(`   • Title: ${data.title}`);
            console.log(`   • Reviews found: ${data.reviews.length}`);

            // Analyze each review via OpenAI
            for (const [idx, review] of data.reviews.entries()) {
                try {
                    const analysis = await analyzeSentimentAndKeywords(review.text);
                    review.sentimentScore = analysis.sentimentScore;
                    review.sentimentCategory = analysis.sentimentCategory;
                    review.keywords = analysis.keywords;
                    console.log(`   ✅ Review ${idx + 1}: ${analysis.sentimentScore.toFixed(3)} (${analysis.sentimentCategory}) | keywords: ${analysis.keywords.join(', ')}`);
                } catch (e) {
                    console.warn(`   ⚠️  OpenAI analysis failed: ${e.message}`);
                    review.sentimentScore = 0;
                    review.sentimentCategory = 'neutral';
                    review.keywords = [];
                }
            }

            // Aggregate keywords from all reviews
            const aggKeywords = Array.from(new Set(data.reviews.flatMap(r => r.keywords || []))).slice(0, 8);

            // Generate image if any keywords
            let imagePath = null;
            if (aggKeywords.length && process.env.OPENAI_API_KEY) {
                try {
                    const base = `${movieId}_${Date.now()}`;
                    imagePath = await generateImageFromKeywords(aggKeywords, this.imageDir, base);
                    console.log(`   Image saved: ${imagePath}`);
                } catch (e) {
                    console.warn(`   ⚠️  Image generation failed: ${e.message}`);
                }
            } else {
                console.log('   ℹ️  Skipping image generation (no keywords or API key)');
            }

            // Save JSON metadata
            const jsonPath = path.join(this.dataDir, `${movieId}_${Date.now()}.json`);
            fs.writeFileSync(jsonPath, JSON.stringify({ ...data, imagePath }, null, 2));
            console.log(`   💾 Saved metadata: ${jsonPath}`);

            summary.push({ movieId, title: data.title, reviews: data.reviews.length, imagePath });
        }

        console.log('\n✅ Completed. Summary:');
        for (const s of summary) {
            console.log(`   • ${s.title} (${s.movieId}): ${s.reviews} reviews${s.imagePath ? `, image: ${path.basename(s.imagePath)}` : ''}`);
        }
        return { summary };
    }

    /**
     * Stream forever: Pick a movie, fetch reviews, analyze each review, generate image per review, save, then repeat.
     * @param {Object} options
     * @param {number} [options.delayMs=3000] - Delay between iterations
     * @param {number} [options.reviewsPerMovie=1] - Number of reviews per movie
     */
    async streamForever(options = {}) {
        const { delayMs = 3000, reviewsPerMovie = 1 } = options;
        console.log('🌊 Starting continuous stream (Ctrl+C to stop)');
        let iteration = 0;
        while (true) {
            iteration += 1;
            try {
                // Prefer random movie; fallback to popular if needed
                let movieId = null;
                const randomIds = await this.generator.getRandomMovieIds(1, 3).catch(() => []);
                if (randomIds && randomIds.length > 0) movieId = randomIds[0];
                if (!movieId) {
                    const popular = this.generator.getPopularMovieIds();
                    movieId = popular[Math.floor(Math.random() * popular.length)];
                }

                console.log(`\n${'='.repeat(50)}`);
                console.log(`🎬 Iteration ${iteration} — Movie: ${movieId}`);
                console.log(`${'='.repeat(50)}`);

                const data = await getMovieData(movieId, reviewsPerMovie);
                const titleSlug = this.slugify(data.title, movieId);
                console.log(`   • Title: ${data.title}`);
                console.log(`   • Reviews: ${data.reviews.length}`);

                let processed = 0;
                for (let i = 0; i < data.reviews.length; i++) {
                    const review = data.reviews[i];
                    const idx = i + 1;
                    if (!review.text || review.text.trim().length < 5) {
                        console.log(`   ⏭️  Review ${idx}: skipped (empty)`);
                        continue;
                    }

                    // Analyze sentiment and keywords per review
                    let analysis = { sentimentScore: 0, sentimentCategory: 'neutral', keywords: [] };
                    try {
                        analysis = await analyzeSentimentAndKeywords(review.text);
                    } catch (e) {
                        console.warn(`   ⚠️  Analysis failed for review ${idx}: ${e.message}`);
                    }

                    // Show the sentiment score and extracted keywords
                    try {
                        const scoreStr = typeof analysis.sentimentScore === 'number' ? analysis.sentimentScore.toFixed(3) : 'N/A';
                        console.log(`   📊 Review ${idx}: sentiment ${scoreStr} (${analysis.sentimentCategory})`);
                        if (analysis.keywords && analysis.keywords.length) {
                            console.log(`      keywords: ${analysis.keywords.join(', ')}`);
                        }
                    } catch (_) { /* noop */ }

                    // Generate an image for this review using its keywords
                    let imagePath = null;
                    if ((analysis.keywords || []).length > 0 && process.env.OPENAI_API_KEY) {
                        try {
                            const base = `${titleSlug}_${movieId}_r${idx}_${Date.now()}`;
                            imagePath = await generateImageFromKeywords(analysis.keywords, this.imageDir, base);
                            console.log(`   🖼️  Review ${idx}: image saved -> ${path.basename(imagePath)}`);
                        } catch (e) {
                            console.warn(`   ⚠️  Image generation failed for review ${idx}: ${e.message}`);
                        }
                    } else {
                        console.log(`   ℹ️  Review ${idx}: skipping image (no keywords or API key)`);
                    }

                    // Save per-review JSON
                    const jsonName = `${titleSlug}_${movieId}_r${idx}_${Date.now()}.json`;
                    const jsonPath = path.join(this.dataDir, jsonName);
                    const payload = {
                        id: movieId,
                        title: data.title,
                        url: data.url,
                        reviewIndex: idx,
                        review: {
                            text: review.text,
                            rating: review.rating || null,
                            author: review.author || null,
                            date: review.date || null
                        },
                        sentimentScore: analysis.sentimentScore,
                        sentimentCategory: analysis.sentimentCategory,
                        keywords: analysis.keywords,
                        imagePath
                    };
                    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
                    console.log(`   💾 Review ${idx}: metadata -> ${path.basename(jsonPath)}`);
                    processed += 1;
                }

                console.log(`   ✅ Iteration ${iteration} complete — processed ${processed} review(s)`);
            } catch (err) {
                console.error(`   ❌ Iteration ${iteration} error: ${err.message}`);
            }

            console.log(`   ⏳ Waiting ${delayMs}ms before next iteration...`);
            await this.sleep(delayMs);
        }
    }

    /**
     * Quick test with just a few movies
     */
    async quickTest() {
        console.log('🧪 Running Quick Random Movie Test\n');
        return await this.analyzeRandomMovies({ movieCount: 2, popularRatio: 1.0, reviewsPerMovie: 1 });
    }

    /**
     * Streamlined continuous flow: Get movie → Analyze sentiment → Send OSC → Repeat
     * This is the main continuous loop for real-time review processing
     * @param {Object} options - Stream options
     */
    // Streaming OSC pathway removed in favor of batch processing

    /**
     * Get movie data with reviews and perform sentiment analysis
     * @param {string} movieId - IMDB movie ID
     * @param {number} limit - Number of reviews to get
     * @returns {Object} - Movie data with sentiment-analyzed reviews
     */
    // Helper no longer used

    /**
     * Full analysis with more movies and iterations
     */
    async fullAnalysis() {
        console.log('🔬 Running Full Random Movie Analysis\\n');
        return await this.analyzeRandomMovies({
            movieCount: 8,
            popularRatio: 0.5,
            loopCount: 2,
            reviewsPerMovie: 2
        });
    }

    /**
     * Continuous looping version that keeps running and sends reviews via OSC
     * @param {Object} options - Continuous analysis options
     */
    // Continuous OSC flow removed

    /**
     * Clean up resources (close OSC connection)
     */
    cleanup() { }
}

// CLI interface
async function main() {
    const streamer = new MovieReviewStreamer();
    const args = process.argv.slice(2);
    const mode = args[0] || 'quick';
    const count = parseInt(args[1]) || (mode === 'full' ? 6 : 2);
    const perMovie = parseInt(args[2]) || 2;
    const delayMs = parseInt(args[1]) || 3000; // for stream mode: first arg after 'stream'

    console.log('='.repeat(60));
    console.log('🎥 MOVIE REVIEW ANALYZER (IMDB + OpenAI)');
    console.log('='.repeat(60));

    try {
        if (mode === 'full') {
            await streamer.analyzeRandomMovies({ movieCount: count, popularRatio: 0.6, reviewsPerMovie: perMovie });
        } else if (mode === 'stream') {
            const streamPerMovie = parseInt(args[2]) || 1; // for stream mode: optional reviewsPerMovie
            await streamer.streamForever({ delayMs, reviewsPerMovie: streamPerMovie });
        } else {
            await streamer.quickTest();
        }
        streamer.cleanup();
    } catch (error) {
        console.error('💥 Failed:', error.message);
        streamer.cleanup();
        process.exit(1);
    }
}

module.exports = MovieReviewStreamer;

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}