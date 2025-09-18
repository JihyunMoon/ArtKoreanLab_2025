const axios = require('axios');
const cheerio = require('cheerio');

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
};

function sanitize(text) {
    return text.replace(/\s+/g, ' ').trim();
}

async function fetchPage(url, headers = DEFAULT_HEADERS) {
    const res = await axios.get(url, { headers, timeout: 15000 });
    return cheerio.load(res.data);
}

/**
 * Extract movie title from title page HTML
 */
function extractTitle($) {
    // Try modern hero title
    let title = $('h1[data-testid="hero__pageTitle"] span').first().text();
    if (!title) title = $('h1.titleHeader__title, .title_wrapper h1').first().text();
    if (title) return sanitize(title.replace(/\(.*?\)$/, '').trim());
    // Fallback to <title>
    const pageTitle = $('title').text();
    if (pageTitle) return sanitize(pageTitle.replace('- IMDb', '').trim());
    return null;
}

/**
 * Scrape a few user reviews from IMDB reviews page
 * @param {string} movieId e.g. tt0111161
 * @param {number} limit how many reviews to return
 */
async function getImdbReviews(movieId, limit = 3) {
    const url = `https://www.imdb.com/title/${movieId}/reviews?ref_=tt_ql_urv`;
    const $ = await fetchPage(url);

    const reviews = [];

    // A variety of potential selectors as IMDB DOM changes often
    const containers = [
        'article.lister-item',
        'div.review-container',
        'article.user-review-item',
        'div.lister-item',
    ];

    let found = [];
    for (const sel of containers) {
        const els = $(sel);
        if (els.length) { found = els.toArray(); break; }
    }

    if (!found.length) {
        // last resort: any article that contains a text block
        found = $('article').toArray();
    }

    for (const el of found) {
        if (reviews.length >= limit) break;
        const $el = $(el);
        // Extract review text via multiple strategies
        const textSelectors = [
            '.text.show-more__control',
            'div.text',
            'div.content div.text',
            '[data-testid="review-overflow"]',
            '[data-testid="review-summary"]',
            'span, p'
        ];
        let text = '';
        for (const tSel of textSelectors) {
            const t = sanitize($el.find(tSel).first().text() || '');
            if (t && t.length > 30) { text = t; break; }
        }
        if (!text) continue;

        // Extract rating if present
        let rating = null;
        const ratingSel = $el.find('[class*="rating"], [data-testid*="rating"]').first().text();
        if (ratingSel) {
            const m = ratingSel.match(/(\d{1,2})\s*\/\s*10/);
            rating = m ? Number(m[1]) : null;
        }

        // Extract author/date lightly
        const author = sanitize($el.find('[data-testid="reviews-author"], .display-name-link, .title').first().text() || '');
        const date = sanitize($el.find('span.review-date, time').first().text() || '');

        reviews.push({
            text,
            rating,
            author: author || null,
            date: date || null,
            source: 'imdb'
        });
    }

    return reviews.slice(0, limit);
}

/**
 * Get movie title and a few reviews
 */
async function getMovieData(movieId, limit = 3) {
    const movieUrl = `https://www.imdb.com/title/${movieId}/`;
    const $movie = await fetchPage(movieUrl);
    const title = extractTitle($movie) || movieId;
    const reviews = await getImdbReviews(movieId, limit);
    return { id: movieId, title, url: movieUrl, reviews };
}

module.exports = {
    getMovieData,
    getImdbReviews,
};
