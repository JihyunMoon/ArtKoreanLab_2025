const fs = require('fs');
const path = require('path');

async function loadLocalTextFiles(options = {}) {
    const { limit = 10, offset = 0, dataDir = './unsup_test_data' } = options;
    const dataPath = path.resolve(dataDir);
    if (!fs.existsSync(dataPath)) throw new Error(`Data directory not found: ${dataPath}`);
    const allFiles = fs.readdirSync(dataPath).filter(f => f.endsWith('.txt')).sort();
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
    return results;
}

module.exports = { loadLocalTextFiles };
