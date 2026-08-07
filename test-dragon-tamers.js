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
const tamers = allCards.filter(c => c.name && c.name.includes('竜使い'));
for (const tamer of tamers) {
    console.log(tamer.cardId + ' ' + tamer.name);
    console.log('Text:\n' + tamer.effect);
    console.log('Impl Kinds: ' + tamer.effects.map(e => e.kind).join(', '));
    console.log('-----------------');
}
