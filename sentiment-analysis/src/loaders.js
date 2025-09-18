const fs = require('fs');
const path = require('path');

async function loadLocalTextFiles(options = {}) {
    const { limit = 10, offset = 0, dataDir = './unsup_test_data' } = options;
    const dataPath = path.resolve(dataDir);
    
    // Return empty array if data directory doesn't exist
    if (!fs.existsSync(dataPath)) {
        console.log(`⚠️  Data directory not found: ${dataPath}`);
        console.log('   Skipping local file analysis. Create the directory and add .txt files to enable this feature.');
        return [];
    }
    
    const allFiles = fs.readdirSync(dataPath).filter(f => f.endsWith('.txt')).sort();
    
    // Return empty array if no text files found
    if (allFiles.length === 0) {
        console.log(`⚠️  No .txt files found in: ${dataPath}`);
        console.log('   Add some .txt files to enable local file analysis.');
        return [];
    }
    
    const selectedFiles = allFiles.slice(offset, offset + limit);
    const results = [];
    
    for (const filename of selectedFiles) {
        const filePath = path.join(dataPath, filename);
        const content = fs.readFileSync(filePath, 'utf8').trim();
        const cleanedContent = content
            .replace(/<br\s*\/?>(?=\s|$)/gi, ' ')
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        results.push({ filename, text: cleanedContent, source: 'local_file' });
    }
    
    console.log(`✅ Loaded ${results.length} local text files for analysis`);
    return results;
}

module.exports = { loadLocalTextFiles };
