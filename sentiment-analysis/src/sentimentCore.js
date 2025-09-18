const { openai } = require('./openaiClient');

async function getSentiment(text, numerical = false) {
    if (numerical) return await getSentimentScore(text);
    const response = await openai.completions.create({
        model: 'gpt-3.5-turbo-instruct',
        prompt: `Sentiment analysis of the following text:\n${text}\n`,
        temperature: 0.5,
        max_tokens: 1,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        stop: ['\n']
    });
    return response.choices[0].text.trim();
}

async function getSentimentChat(text, numerical = false) {
    if (numerical) return await getSentimentScore(text);
    const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
            { role: 'system', content: "You are a sentiment analysis assistant. Respond with only one word: 'Positive', 'Negative', or 'Neutral'." },
            { role: 'user', content: `Analyze the sentiment of this text: "${text}"` }
        ],
        temperature: 0.5,
        max_tokens: 1
    });
    return response.choices[0].message.content.trim();
}

async function getSentimentScore(text) {
    const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
            { role: 'system', content: 'You are a sentiment analysis assistant. Analyze the sentiment of text and respond with only a decimal number between -1 and 1, where -1 is most negative, 0 is neutral, and 1 is most positive. Use up to 2 decimal places for precision.' },
            { role: 'user', content: `Analyze the sentiment of this text: "${text}"` }
        ],
        temperature: 0.3,
        max_tokens: 10
    });
    const scoreText = response.choices[0].message.content.trim();
    const score = parseFloat(scoreText);
    if (isNaN(score) || score < -1 || score > 1) return 0;
    return score;
}

module.exports = { getSentiment, getSentimentChat, getSentimentScore };
