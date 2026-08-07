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
    if (!card.effect || !card.effects) continue;
    
    // Quick block text mapping
    const blocks = card.effect.split(/^(?=Lv\d|フラッシュ|メイン)/m).filter(b => b.trim());
    
    for (const eff of card.effects) {
        if (eff.kind === 'triggered' || eff.kind === 'step') {
            // Find which block this effect belongs to by checking text
            // For simplicity, just check the whole card effect text if it lacks keywords
            const text = card.effect;
            
            // If it's step, text should have 'ステップ'
            if (eff.kind === 'step') {
                if (!text.includes('ステップ')) {
                    suspicious.push({ id: card.cardId, name: card.name, kind: eff.kind, text });
                }
            }
            
            // If it's triggered, text should have '時』' or 'とき' or 'たび'
            if (eff.kind === 'triggered') {
                if (!text.includes('時』') && !text.includes('とき') && !text.includes('たび') && !text.includes('バトル時')) {
                    // some effects say 『このスピリットのアタック時』, some say 破壊されたとき
                    suspicious.push({ id: card.cardId, name: card.name, kind: eff.kind, text });
                }
            }
        }
    }
}
console.log('Suspicious triggered/step effects: ' + suspicious.length);
suspicious.forEach(s => {
    console.log(`${s.id} ${s.name} [${s.kind}]`);
    console.log(s.text.slice(0, 100).replace(/\n/g, '\\n'));
    console.log('---');
});
