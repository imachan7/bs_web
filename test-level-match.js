const fs = require('fs');
const path = require('path');
const dataDir = '/Users/imachan/develop/bs_web/data/cards';
let allCards = [];
for (const file of fs.readdirSync(dataDir)) {
    if (file.endsWith('.json')) {
        const batch = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
        allCards = allCards.concat(batch);
    }
}

const BLOCK_HEADER_RE = /^(?:(?:フラッシュ|メイン)：?$|Lv\d(?:[･・/]Lv\d)*(?:：フラッシュ)?(?:\s*(?:【[^】]*】|『[^』]*』|[/･・]))*\s*$)/;

function extractHeaders(text) {
    const headers = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (BLOCK_HEADER_RE.test(trimmed)) {
            headers.push(trimmed.slice(0, 80));
        }
    }
    return headers;
}

function parseLevels(headerText) {
    if (headerText.includes('フラッシュ') && !headerText.includes('Lv')) return null; // usually means any level if just "フラッシュ："
    if (headerText.includes('メイン') && !headerText.includes('Lv')) return null; 
    
    const levels = [];
    const matches = headerText.match(/Lv\d/g);
    if (matches) {
        for (const m of matches) {
            levels.push(parseInt(m.replace('Lv', '')));
        }
    }
    return levels.length > 0 ? levels : null;
}

let mismatches = 0;
for (const card of allCards) {
    const text = card.effect || '';
    if (!text) continue;
    
    const headers = extractHeaders(text);
    if (headers.length === 0) continue;
    
    // If block count doesn't match effect count, it's hard to align them perfectly by index.
    // Let's assume for now they map 1:1 in order (e1 -> header[0], e2 -> header[1]).
    // For a more robust check, we map effects by their ID suffix (e1, e2).
    
    for (let i = 0; i < headers.length; i++) {
        const expectedId = `${card.cardId}-e${i+1}`;
        const eff = card.effects.find(e => e.id === expectedId);
        if (!eff) continue; // Missing implementation is caught by category 1
        
        const expectedLevels = parseLevels(headers[i]);
        if (expectedLevels) {
            const implLevels = eff.levels;
            
            // Compare expectedLevels array with implLevels array
            // Note: null in implLevels means 'all levels' or not level restricted (like magic).
            // For spirits/nexuses, we should check exact match.
            if (implLevels !== null) {
                const eStr = expectedLevels.sort().join(',');
                const iStr = implLevels.sort().join(',');
                if (eStr !== iStr) {
                    console.log(`${card.cardId} ${card.name} (${eff.id})`);
                    console.log(`  Text says: ${headers[i]} (Expected: [${eStr}])`);
                    console.log(`  Impl says: [${iStr}]`);
                    mismatches++;
                }
            } else {
                // If implLevels is null, it's usually magic or global. But if text specifies Lv1,2, it might be an error?
                if (card.type === 'spirit' || card.type === 'nexus') {
                     // null levels on spirit/nexus might be a bug if the text specified levels.
                     console.log(`${card.cardId} ${card.name} (${eff.id})`);
                     console.log(`  Text says: ${headers[i]} (Expected: [${expectedLevels.join(',')}])`);
                     console.log(`  Impl says: null`);
                     mismatches++;
                }
            }
        }
    }
}
console.log(`Found ${mismatches} level mismatches.`);
