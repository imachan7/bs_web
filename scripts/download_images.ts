import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cardsPath = path.join(__dirname, '../data/cards.json')
const imgDir = path.join(__dirname, '../public/imgs/cards')

if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir, { recursive: true })
}

const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'))

async function downloadImage(cardId: string) {
    const dest = path.join(imgDir, `${cardId}.jpg`)
    if (fs.existsSync(dest)) {
        return // Already downloaded
    }

    try {
        // batspi wiki のページから画像URLを探す
        const url = `https://batspi.com/index.php?${cardId}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const html = await res.text()

        // imgタグのsrcを正規表現で探す
        // <img alt="BS01-001.jpg" src="/images/b/be/BS01-001.jpg" ...> のような形式を想定
        const match = html.match(new RegExp(`src="(/images/[^"]+/${cardId}\\.jpg)"`, 'i')) || 
                      html.match(/src="(\/images\/[^"]+\.jpg)"/i)
        
        if (match && match[1]) {
            const imgUrl = `https://batspi.com${match[1]}`
            const imgRes = await fetch(imgUrl)
            if (!imgRes.ok) throw new Error(`Image HTTP ${imgRes.status}`)
            
            const buffer = Buffer.from(await imgRes.arrayBuffer())
            fs.writeFileSync(dest, buffer)
            console.log(`[OK] ${cardId}`)
        } else {
            console.log(`[Skip] ${cardId} - Image URL not found on Wiki`)
        }
    } catch (e: any) {
        console.log(`[Error] ${cardId} - ${e.message}`)
    }
    
    // サーバー負荷軽減のため少し待つ
    await new Promise(r => setTimeout(r, 1000))
}

async function main() {
    console.log(`Downloading images for ${cards.length} cards...`)
    for (const card of cards) {
        await downloadImage(card.cardId)
    }
    console.log("Done!")
}

main().catch(console.error)
