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

let mismatches = 0;
for (const card of allCards) {
    if (!card.effect || !card.effects) continue;
    
    // Look for BP+XXXX in text
    const bpMatches = card.effect.match(/BP\+(\d+)/g);
    if (bpMatches) {
        const expectedBps = bpMatches.map(m => parseInt(m.replace('BP+', '')));
        
        // Find all bpBuff amounts in implementation
        const implBps = [];
        JSON.stringify(card.effects, (key, value) => {
            if (key === 'amount' && (value >= 1000 || value <= -1000)) { 
                 // heuristic: large amounts are usually BP. 
                 // Better: look for { type: 'bpBuff', amount: X } or { type: 'aura', buff: { bp: X } }
                 implBps.push(value);
            }
            if (value && typeof value === 'object' && value.type === 'bpBuff') {
                 implBps.push(value.amount);
            }
            return value;
        });
        
        for (const expected of expectedBps) {
            if (!implBps.includes(expected)) {
                console.log(`${card.cardId} ${card.name}: Text says BP+${expected}, but not found in effects JSON`);
                mismatches++;
            }
        }
    }
}
console.log(`Found ${mismatches} BP mismatches.`);
