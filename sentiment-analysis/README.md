# Movie Review Sentiment Streaming with Node.js and OSC

This project provides a Node.js application that continuously streams movie reviews, performs sentiment analysis using OpenAI's API, and sends the results via OSC (Open Sound Control) for real-time audio/visual applications.

## Features

- **Continuous Movie Review Streaming**: Automatically fetches random movie data and reviews
- **Real-time Sentiment Analysis**: Uses OpenAI's API to analyze review sentiment (-1 to 1 scale)
- **OSC Integration**: Sends sentiment data via OSC to localhost:57120 for SuperCollider, Max/MSP, etc.
- **Configurable Parameters**: Adjustable delay between reviews, review count limits, and reviews per movie

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

### Start the Movie Review Stream

```bash
# Start streaming with default settings (3-second delays, unlimited reviews)
node random-movie-analyzer.js

# Custom settings - 5-second delays, max 10 reviews, 2 reviews per movie
node random-movie-analyzer.js --delay 5000 --max 10 --reviews 2
```

### Test OSC Functionality

```bash
# Test OSC sending only
node test-osc.js osc

# Test stream mode (5 reviews)
node test-osc.js stream

# Run all tests
node test-osc.js all
```

### OSC Data Format

The application sends three OSC messages for each review:

- `/movie/title` - Movie title (string)
- `/movie/review` - Review text content (string)  
- `/movie/sentiment` - Sentiment score from -1 to 1 (float)

### SuperCollider Integration Example

```supercollider
// Receive movie review data in SuperCollider
OSCdef(\movieTitle, {|msg| 
    ("Movie: " ++ msg[1]).postln;
}, "/movie/title");

OSCdef(\movieReview, {|msg| 
    ("Review: " ++ msg[1]).postln;
}, "/movie/review");

OSCdef(\movieSentiment, {|msg| 
    ("Sentiment: " ++ msg[1]).postln;
    // Use sentiment value to control audio parameters
    ~synth.set(\freq, msg[1].linexp(-1, 1, 200, 800));
}, "/movie/sentiment");
```

## Command Line Options

- `--delay <ms>` - Milliseconds between reviews (default: 3000)
- `--max <number>` - Maximum number of reviews to process (default: unlimited)
- `--reviews <number>` - Number of reviews per movie (default: 1)

## Project Structure

```text
random-movie-analyzer.js   # Main streaming application
test-osc.js               # OSC testing utilities
src/
  oscSender.js           # OSC client wrapper
  openaiClient.js        # OpenAI API client
  sentimentCore.js       # Sentiment analysis functions
  scrapers.js            # IMDB scraping utilities
  analyzers.js           # Review analysis logic
  loaders.js             # Data loading utilities
config.js                 # Configuration settings
```

## Dependencies

- `node-osc`: OSC (Open Sound Control) messaging
- `openai`: Official OpenAI Node.js library
- `axios`: HTTP client for web scraping
- `cheerio`: Server-side HTML parsing
- `dotenv`: Environment variable management

## Use Cases

- Real-time audio-visual installations responding to movie sentiment
- Live coding performances with sentiment-driven parameters
- Interactive media art projects
- Data sonification experiments
- Educational demonstrations of sentiment analysis

## License

MIT
