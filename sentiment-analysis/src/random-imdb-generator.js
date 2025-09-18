const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Random IMDB Movie ID Generator and Data Fetcher
 * 
 * IMDB movie IDs follow the pattern: tt + 7-8 digits
 * Examples: tt0111161 (The Shawshank Redemption), tt0068646 (The Godfather)
 */

class RandomIMDBGenerator {
    constructor() {
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
        };
    }

    /**
     * Generate a random IMDB movie ID
     * @param {number} minId - Minimum ID number (default: 100000)
     * @param {number} maxId - Maximum ID number (default: 30000000) 
     * @returns {string} - Random IMDB ID like 'tt1234567'
     */
    generateRandomMovieId(minId = 100000, maxId = 30000000) {
        const randomNumber = Math.floor(Math.random() * (maxId - minId + 1)) + minId;
        // Pad with zeros to make it 7-8 digits
        const paddedNumber = randomNumber.toString().padStart(7, '0');
        return `tt${paddedNumber}`;
    }

    /**
     * Check if a movie ID exists and get basic info
     * @param {string} movieId - IMDB movie ID
     * @returns {Object|null} - Movie info or null if doesn't exist
     */
    async checkMovieExists(movieId) {
        try {
            const url = `https://www.imdb.com/title/${movieId}/`;
            console.log(`🔍 Checking movie: ${url}`);

            const response = await axios.get(url, {
                headers: this.headers,
                timeout: 10000,
                maxRedirects: 5
            });

            // Check if we got redirected or got a valid movie page
            if (response.status !== 200) {
                return null;
            }

            const $ = cheerio.load(response.data);

            // Check if page contains movie data (not error page)
            const title = $('h1[data-testid="hero__pageTitle"] span, .title_wrapper h1, h1.titleHeader__title').text().trim();
            const year = $('.title_wrapper .titleYear, [data-testid="hero__pageTitle"] + div, .titleHeader__title-year').text().trim();
            const rating = $('[data-testid="hero-rating-bar__aggregate-rating__score"], .ratingValue strong, .aggregate-rating').text().trim();

            // Additional checks to ensure it's a valid movie page
            const pageTitle = $('title').text();
            if (pageTitle.includes('Page not found') ||
                pageTitle.includes('404') ||
                !title ||
                title.length < 2) {
                return null;
            }

            return {
                id: movieId,
                title: title || 'Unknown Title',
                year: year || 'Unknown Year',
                rating: rating || 'No Rating',
                url: url,
                pageTitle: pageTitle
            };

        } catch (error) {
            console.log(`❌ Error checking ${movieId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Get a random valid movie with basic info
     * @param {number} maxAttempts - Maximum attempts to find a valid movie
     * @returns {Object|null} - Valid movie info or null if none found
     */
    async getRandomMovie(maxAttempts = 10) {
        console.log(`🎲 Searching for random movie (max ${maxAttempts} attempts)...`);

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const randomId = this.generateRandomMovieId();
            console.log(`🎯 Attempt ${attempt}/${maxAttempts}: Trying ${randomId}`);

            const movieInfo = await this.checkMovieExists(randomId);

            if (movieInfo) {
                console.log(`✅ Found valid movie: ${movieInfo.title} (${movieInfo.year}) - Rating: ${movieInfo.rating}`);
                return movieInfo;
            }

            // Small delay between attempts
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`❌ No valid movies found after ${maxAttempts} attempts`);
        return null;
    }

    /**
     * Get multiple random movies
     * @param {number} count - Number of movies to find
     * @param {number} maxAttemptsPerMovie - Max attempts per movie
     * @returns {Array} - Array of movie info objects
     */
    async getRandomMovies(count = 5, maxAttemptsPerMovie = 10) {
        console.log(`🎬 Finding ${count} random movies...`);
        const movies = [];

        for (let i = 1; i <= count; i++) {
            console.log(`\\n--- Finding Movie ${i}/${count} ---`);
            const movie = await this.getRandomMovie(maxAttemptsPerMovie);

            if (movie) {
                movies.push(movie);
                console.log(`📽️  Added: ${movie.title} (${movie.id})`);
            }
        }

        console.log(`\\n🎉 Found ${movies.length}/${count} valid movies`);
        return movies;
    }

    /**
     * Get random movie IDs for use with existing scraper
     * @param {number} count - Number of IDs to generate
     * @param {number} maxAttemptsPerMovie - Max attempts per movie
     * @returns {Array} - Array of valid movie IDs
     */
    async getRandomMovieIds(count = 5, maxAttemptsPerMovie = 5) {
        const movies = await this.getRandomMovies(count, maxAttemptsPerMovie);
        return movies.map(movie => movie.id);
    }

    /**
     * Get a curated list of known good movie IDs (backup option)
     * @returns {Array} - Array of popular movie IDs
     */
    getPopularMovieIds() {
        return [
            'tt0111161', // The Shawshank Redemption
            'tt0068646', // The Godfather
            'tt0071562', // The Godfather Part II  
            'tt0468569', // The Dark Knight
            'tt0050083', // 12 Angry Men
            'tt0108052', // Schindler's List
            'tt0167260', // The Lord of the Rings: The Return of the King
            'tt0110912', // Pulp Fiction
            'tt0060196', // The Good, the Bad and the Ugly
            'tt0137523', // Fight Club
            'tt0120737', // The Lord of the Rings: The Fellowship of the Ring
            'tt0109830', // Forrest Gump
            'tt0080684', // Star Wars: The Empire Strikes Back
            'tt1375666', // Inception
            'tt0167261', // The Lord of the Rings: The Two Towers
            'tt0073486', // One Flew Over the Cuckoo's Nest
            'tt0099685', // Goodfellas
            'tt0076759', // Star Wars: A New Hope
            'tt0317248', // City of God
            'tt0047478', // Seven Samurai
        ];
    }
}

// Test the generator if run directly
async function testGenerator() {
    console.log('🚀 Testing Random IMDB Generator\\n');

    const generator = new RandomIMDBGenerator();

    // Test 1: Generate some random IDs
    console.log('=== Test 1: Random ID Generation ===');
    for (let i = 0; i < 3; i++) {
        console.log(`Random ID ${i + 1}: ${generator.generateRandomMovieId()}`);
    }

    // Test 2: Find one random movie
    console.log('\\n=== Test 2: Find Random Movie ===');
    const randomMovie = await generator.getRandomMovie(5);
    if (randomMovie) {
        console.log('Success:', randomMovie);
    }

    // Test 3: Get popular movie IDs
    console.log('\\n=== Test 3: Popular Movie IDs ===');
    const popularIds = generator.getPopularMovieIds();
    console.log(`Popular movies: ${popularIds.slice(0, 5).join(', ')}...`);
}

module.exports = RandomIMDBGenerator;

// Run test if called directly
if (require.main === module) {
    testGenerator().catch(console.error);
}