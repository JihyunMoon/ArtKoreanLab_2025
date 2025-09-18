const { customLoopAnalyzer, analysisPresets } = require('./sentiment');

async function demonstrateCustomLoop() {
    console.log('=== Custom Loop Analyzer Demo ===');

    // Example 1: Local + Online, 2 iterations, randomize online sources
    console.log('\n▶️ Example 1: BOTH sources, 2 iterations, random online movie each run');
    const bothRandom = await customLoopAnalyzer({
        mode: 'both',
        loopCount: 2,
        loopDelayMs: 1000,
        randomizeOnline: true,
        onlineSources: ['imdb'],
        limit: 2,
        showProgress: true
    });

    // Example 2: Online random preset (uses both IMDB and Rotten Tomatoes by default)
    console.log('\n▶️ Example 2: Online Random Preset');
    const onlineRandom = await analysisPresets.onlineRandom(2, 2);

    // Example 3: Custom options - continuous mode (runs a small number of times for demo)
    // Note: For safety in demos, we simulate continuous by setting loopCount=3
    console.log('\n▶️ Example 3: Simulated continuous mode (3 iterations)');
    const simulatedContinuous = await customLoopAnalyzer({
        mode: 'local',
        loopCount: 3,
        loopDelayMs: 500,
        limit: 3,
        showProgress: false
    });

    console.log('\n=== DEMO SUMMARY ===');
    const sections = [
        { title: 'Both (Random Online)', data: bothRandom },
        { title: 'Online Random Preset', data: onlineRandom },
        { title: 'Simulated Continuous (Local)', data: simulatedContinuous }
    ];

    for (const s of sections) {
        console.log(`\n• ${s.title}`);
        if (!s.data) {
            console.log('  No data.');
            continue;
        }
        console.log(`  Iterations: ${s.data.iterations}`);
        console.log(`  Total Reviews: ${s.data.summary.totalReviews}`);
        console.log(`  Average Score: ${s.data.summary.averageScore.toFixed(3)}`);
        console.log(`  Distribution: +${s.data.summary.distribution.positive} / -${s.data.summary.distribution.negative} / ~${s.data.summary.distribution.neutral} (errors: ${s.data.summary.distribution.errors})`);
    }

    return { bothRandom, onlineRandom, simulatedContinuous };
}

if (require.main === module) {
    demonstrateCustomLoop().then(() => {
        console.log('\n✅ Custom loop demo complete');
    }).catch(err => {
        console.error('❌ Custom loop demo failed:', err);
    });
}

module.exports = { demonstrateCustomLoop };
