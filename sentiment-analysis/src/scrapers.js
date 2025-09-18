const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeRottenTomatoesReviews(movieUrl, options = {}) {
    const { limit = 20 } = options;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
    };
    const response = await axios.get(movieUrl, { headers, timeout: 10000 });
    const $ = cheerio.load(response.data);
    const reviews = [];
    const els = $('.audience-review-row, .review_text, .user-review').slice(0, limit);
    els.each((_, el) => {
        const reviewText = $(el).find('.the_review, .review-text, p').first().text().trim();
        const reviewerName = $(el).find('.audience-review-row__reviewer, .reviewer-name, .user-name').first().text().trim();
        const rating = $(el).find('.star-display, .rating, .score').first().text().trim();
        if (reviewText && reviewText.length > 10) {
            reviews.push({ text: reviewText, reviewer: reviewerName || 'Anonymous', rating: rating || 'N/A', source: 'rotten_tomatoes', url: movieUrl });
        }
    });
    return reviews;
}

async function scrapeIMDBReviews(movieId, options = {}) {
    const { limit = 25 } = options;
    const reviewsUrl = `https://www.imdb.com/title/${movieId}/reviews`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
    };
    const response = await axios.get(reviewsUrl, { headers, timeout: 10000 });
    const $ = cheerio.load(response.data);
    const reviews = [];
    const els = $('.review-container, .lister-item').slice(0, limit);
    els.each((_, el) => {
        const reviewText = $(el).find('.text, .content .text, div[data-testid="review-summary"] .content').text().trim();
        const reviewerName = $(el).find('.display-name-link, .reviewer-name, [data-testid="review-summary"] .reviewer').text().trim();
        const rating = $(el).find('.rating-other-user-rating, .ipl-ratings-bar, .rating span').first().text().trim();
        const title = $(el).find('.title, .review-summary-header a, [data-testid="review-summary"] .title').text().trim();
        if (reviewText && reviewText.length > 20) {
            reviews.push({ text: reviewText, reviewer: reviewerName || 'Anonymous', rating: rating || 'N/A', title: title || 'Untitled Review', source: 'imdb', url: reviewsUrl });
        }
    });
    return reviews;
}

async function scrapeWebContent(url, options = {}) {
    const { textSelector = 'p, .review, .comment, .user-review, .review-text', limit = 50, minLength = 20 } = options;
    const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' };
    const response = await axios.get(url, { headers, timeout: 15000 });
    const $ = cheerio.load(response.data);
    const textContent = [];
    $(textSelector).each((index, el) => {
        if (textContent.length >= limit) return false;
        const text = $(el).text().trim();
        if (text && text.length >= minLength) textContent.push({ text, source: 'web_scrape', url, elementIndex: index });
    });
    return textContent;
}

async function pickRandomImdbMovieIdFromWeb(config) {
    try {
        const pages = (config && config.randomSources && config.randomSources.imdb && config.randomSources.imdb.listPages) || [];
        if (pages.length === 0) return null;
        const pageUrl = pages[Math.floor(Math.random() * pages.length)];
        const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' };
        const res = await axios.get(pageUrl, { headers, timeout: 12000 });
        const $ = cheerio.load(res.data);
        const ids = new Set();
        $('a[href*="/title/tt"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const m = href.match(/\/title\/(tt\d{7,8})/);
            if (m) ids.add(m[1]);
        });
        const arr = Array.from(ids);
        return arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null;
    } catch (e) {
        return null;
    }
}

async function pickRandomRtMovieUrlFromWeb(config) {
    try {
        const pages = (config && config.randomSources && config.randomSources.rottenTomatoes && config.randomSources.rottenTomatoes.listPages) || [];
        if (pages.length === 0) return null;
        const pageUrl = pages[Math.floor(Math.random() * pages.length)];
        const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' };
        const res = await axios.get(pageUrl, { headers, timeout: 12000 });
        const $ = cheerio.load(res.data);
        const urls = new Set();
        $('a[href^="/m/"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            if (/^\/m\//.test(href)) urls.add('https://www.rottentomatoes.com' + href.replace(/\/$/, ''));
        });
        const arr = Array.from(urls);
        return arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null;
    } catch (e) {
        return null;
    }
}

module.exports = {
    scrapeRottenTomatoesReviews,
    scrapeIMDBReviews,
    scrapeWebContent,
    pickRandomImdbMovieIdFromWeb,
    pickRandomRtMovieUrlFromWeb
};
