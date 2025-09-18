// Central configuration for sentiment analysis runtime
// Adjust these values to switch between local/online modes, looping behavior, and randomization.

module.exports = {
    loop: {
        // Run forever when true; otherwise runs loopCount times
        continuous: false,
        loopCount: 3,
        loopDelayMs: 2000
    },
    analysis: {
        mode: 'both', // 'local' | 'online' | 'both' | 'auto'
        limit: 3,
        offset: 0,
        showProgress: true,
        onlineSources: ['imdb', 'rottentomatoes']
    },
    randomization: {
        randomizeOnline: true,
        // If imdbPool/rtPool are empty or undefined, dynamic selectors will be used (see randomSources below)
        imdbPool: [],
        rtPool: []
    },
    randomSources: {
        // Pages used to discover random movies dynamically; we pick random titles from these pages.
        imdb: {
            // Popular/Top charts pages (stable, public pages). We will fetch one randomly.
            listPages: [
                'https://www.imdb.com/chart/top/',
                'https://www.imdb.com/chart/moviemeter/',
                'https://www.imdb.com/chart/top-english-movies/'
            ]
        },
        rottenTomatoes: {
            // TomatoMeter, Top 100, Popular pages
            listPages: [
                'https://www.rottentomatoes.com/top/bestofrt/',
                'https://www.rottentomatoes.com/browse/movies_in_theaters/',
                'https://www.rottentomatoes.com/browse/movies_at_home/'
            ]
        }
    }
};
