# Enhanced Sentiment Analysis with Node.js and OpenAI

This project provides a comprehensive Node.js implementation for sentiment analysis using OpenAI's API, with support for local file processing and web scraping capabilities. The codebase is modularized under `src/`, and the top-level `sentiment.js` re-exports the public API for simplicity.

## Features

- Multiple Sentiment Analysis Methods
  - Legacy Completions API (similar to the original Python code)
  - Modern Chat Completions API (recommended)
  - Numerical sentiment scoring (-1 to 1 scale)
- Data Loading Capabilities
  - Local file processing from `unsup_test_data` folder
  - Web scraping for IMDB and Rotten Tomatoes reviews
  - Generic web content extraction
- Batch Processing
  - Analyze multiple texts with aggregated results
  - Configurable batch size and filtering options
- Enhanced Features
  - Error handling and logging
  - Modular design for easy integration
  - Rate limiting to avoid API quotas
  - Text preprocessing and cleaning
  - Config-driven continuous runs and randomized online sources

## Setup

1. Install dependencies

   ```bash
   npm install
   ```

2. Set up environment variables

   ```bash
   cp .env.example .env
   ```

   Then edit `.env` and add your OpenAI API key:

   ```env
   OPENAI_API_KEY=your_actual_api_key_here
   ```

3. Get an OpenAI API key

  Visit [OpenAI API Keys](https://platform.openai.com/api-keys) to create a new API key, then add it to your `.env` file.

## Usage

### Run the basic example

```bash
npm start
# or
node sentiment.js
```

### Run with config (looping, random online sources)

```bash
npm run run:config
```

Edit `config.js` to control:

- `loop.continuous` (true for infinite runs) and `loop.loopCount` for finite iterations
- `analysis.mode`: `local` | `online` | `both` | `auto`
- `analysis.onlineSources`: `['imdb', 'rt']` to choose sources
- `randomization.randomizeOnline`: enable random movie selection each run
- `randomSources`: tune IMDB/RottenTomatoes list pages used for random picking

### Use as a module

```javascript
const { getSentiment, getSentimentChat, customLoopAnalyzer } = require('./sentiment');

async function analyzeSentiment() {
  const text = 'I love this new feature!';

  // Using legacy completions API
  const sentiment1 = await getSentiment(text);
  console.log('Sentiment:', sentiment1);

  // Using chat completions API (recommended)
  const sentiment2 = await getSentimentChat(text);
  console.log('Sentiment:', sentiment2);
}

analyzeSentiment();
```

### Project Structure

```text
sentiment.js           # Re-exports from src for convenience
src/
  index.js            # Public API aggregation
  openaiClient.js     # OpenAI client with dotenv
  sentimentCore.js    # Core sentiment functions
  loaders.js          # Local dataset loaders/cleaners
  scrapers.js         # IMDB/RT scrapers + random pickers
  analyzers.js        # Batch, switchable, and custom loop analyzers
config.js              # Config for looping and randomization
run-with-config.js     # Runner that uses config.js
custom-loop-demo.js    # Demo script for custom loop analyzer
```

## Python Version

### Original Python Code

```python
def get_sentiment(text):
    response = openai.Completion.create(
        engine="gpt-3.5-turbo-instruct",
        prompt=f"Sentiment analysis of the following text:\n{text}\n",
        temperature=0.5,
        max_tokens=1,
        top_p=1,
        frequency_penalty=0,
        presence_penalty=0,
        stop=["\n"]
    )
    sentiment = response.choices[0].text.strip()
    return sentiment
```

### Node.js Equivalent

```javascript
async function getSentiment(text) {
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
```

## Key Changes

1. Model Update: `text-davinci-002` is deprecated; using `gpt-3.5-turbo-instruct` instead
2. Async/Await: JavaScript uses promises and async/await pattern
3. Error Handling: Added try-catch blocks for better error management
4. Modern Alternative: Included `getSentimentChat()` using the newer Chat Completions API

## Dependencies

- `openai`: Official OpenAI Node.js library
- `dotenv`: Environment variable management

## License

MIT
