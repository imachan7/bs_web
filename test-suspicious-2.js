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
const suspicious = [];
for (const card of allCards) {
    if (!card.effect || !card.effects || card.effects.length === 0) continue;
    
    // Check if text has a trigger but implementation lacks it
    const text = card.effect;
    
    const hasTriggerText = text.includes('時』') || text.includes('とき、') || text.includes('たび、');
    const hasStepText = text.includes('ステップ』');
    
    const hasTriggerImpl = card.effects.some(e => ['triggered', 'fieldEvent', 'battleWon', 'exhaustOnManualCoreAdd', 'effectGrant'].includes(e.kind));
    const hasStepImpl = card.effects.some(e => ['step', 'effectGrant'].includes(e.kind) || e.phaseTurn);
    
    if (hasTriggerText && !hasTriggerImpl) {
        suspicious.push({ id: card.cardId, name: card.name, issue: 'Missing trigger impl', text });
    }
    if (hasStepText && !hasStepImpl) {
        suspicious.push({ id: card.cardId, name: card.name, issue: 'Missing step impl', text });
    }
}
console.log('Suspicious cards: ' + suspicious.length);
suspicious.forEach(s => {
    console.log(`${s.id} ${s.name} [${s.issue}]`);
    // console.log(s.text.slice(0, 100).replace(/\n/g, '\\n'));
    console.log('---');
});
