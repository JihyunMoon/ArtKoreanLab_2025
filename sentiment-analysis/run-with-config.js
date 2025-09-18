const { customLoopAnalyzer } = require('./sentiment');
const config = require('./config');

async function main() {
    const opts = {
        mode: config.analysis.mode,
        loopCount: config.loop.loopCount,
        continuous: config.loop.continuous,
        loopDelayMs: config.loop.loopDelayMs,
        randomizeOnline: config.randomization.randomizeOnline,
        imdbPool: config.randomization.imdbPool,
        rtPool: config.randomization.rtPool,
        limit: config.analysis.limit,
        offset: config.analysis.offset,
        showProgress: config.analysis.showProgress,
        onlineSources: config.analysis.onlineSources
    };

    console.log('Running with configuration:', JSON.stringify(opts, null, 2));
    await customLoopAnalyzer(opts);
}

if (require.main === module) {
    main().catch(err => {
        console.error('Run failed:', err);
    });
}
