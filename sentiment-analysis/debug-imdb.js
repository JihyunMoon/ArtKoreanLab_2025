const axios = require('axios');
const cheerio = require('cheerio');

async function debugIMDBStructure() {
    // Test with The Shawshank Redemption - a movie that definitely has reviews
    const url = 'https://www.imdb.com/title/tt0111161/reviews';
    console.log('🔍 Testing IMDB structure with:', url);

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
    };

    try {
        const response = await axios.get(url, { headers, timeout: 15000 });
        const $ = cheerio.load(response.data);

        console.log('📄 Page title:', $('title').text().trim());
        console.log('');

        // Look for review-related elements
        console.log('🔍 Looking for review containers...');

        // Check for data-testid attributes that might contain reviews
        const dataTestIds = $('[data-testid]').map((_, el) => $(el).attr('data-testid')).get();
        const reviewTestIds = [...new Set(dataTestIds)].filter(id =>
            id && (id.includes('review') || id.includes('user') || id.includes('comment'))
        );
        console.log('📊 Review-related data-testid values:', reviewTestIds);

        // Look for common review containers
        const possibleSelectors = [
            'article',
            'div[class*="review"]',
            'div[class*="user"]',
            'div[data-testid*="review"]',
            '.lister-item',
            '.review-container',
            '.titleReviewBarItem'
        ];

        possibleSelectors.forEach(selector => {
            const elements = $(selector);
            if (elements.length > 0) {
                console.log(`✅ Found ${elements.length} elements with '${selector}'`);
                const first = elements.first();
                const classes = first.attr('class') || '';
                const testId = first.attr('data-testid') || '';
                console.log(`   First element: class="${classes}" data-testid="${testId}"`);
            }
        });

        // Focus on review articles
        console.log('\n🔍 Analyzing review articles...');

        const reviewArticles = $('article.user-review-item');
        console.log(`� Found ${reviewArticles.length} review articles`);

        if (reviewArticles.length > 0) {
            reviewArticles.slice(0, 2).each((i, article) => {
                const $article = $(article);
                console.log(`\n📝 Review Article ${i + 1}:`);
                console.log(`   Classes: ${$article.attr('class')}`);

                // Look for review text within this article
                const textSelectors = [
                    '[data-testid="review-summary"]',
                    '[data-testid="review-overflow"]',
                    '.text',
                    '.content',
                    'div[class*="text"]',
                    'span[class*="text"]'
                ];

                textSelectors.forEach(selector => {
                    const textEl = $article.find(selector);
                    if (textEl.length > 0) {
                        const text = textEl.text().trim();
                        if (text.length > 20) {
                            console.log(`   ✅ Found text with '${selector}': "${text.substring(0, 100)}..." (${text.length} chars)`);
                        }
                    }
                });

                // Look for author info
                const authorEl = $article.find('[data-testid="reviews-author"]');
                if (authorEl.length > 0) {
                    console.log(`   👤 Author: "${authorEl.text().trim()}"`);
                }

                // Look for rating
                const ratingEl = $article.find('[class*="rating"], [data-testid*="rating"]');
                if (ratingEl.length > 0) {
                    console.log(`   ⭐ Rating element found: "${ratingEl.text().trim()}"`);
                }

                // Show the article's HTML structure (first 300 chars)
                console.log(`   🏗️  Structure preview: ${$article.html().substring(0, 200)}...`);
            });
        }        // Look for review navigation or load more buttons
        const loadMoreButtons = $('button, a').filter((_, el) => {
            const text = $(el).text().toLowerCase();
            return text.includes('load') || text.includes('more') || text.includes('show');
        });

        if (loadMoreButtons.length > 0) {
            console.log('\n🔄 Found potential load more buttons:');
            loadMoreButtons.slice(0, 3).each((i, el) => {
                const $el = $(el);
                console.log(`   "${$el.text().trim()}" - class: ${$el.attr('class') || 'none'}`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error(`❌ Status: ${error.response.status}`);
        }
    }
}

// Run the debug
debugIMDBStructure().catch(console.error);