// 器（アクション／カウンター）の共有による解釈の食い違いを洗う（`npx tsx scripts/audit-shared-actions.ts`）
//
// 2026-08-20 に見つかった2件が出発点:
//   - summonFromHandFree: 「コストを支払わずに」の記載が無い BS08帝竜騎サイクルにも
//     コスト無料の挙動が適用されていた
//   - voidCoreToOther: 「このスピリット以外の」の記載がある BS01-066 スタッグローブ由来の
//     self 除外が、記載の無い BS09-020ヤミヤンマ／BS09-023ラルバにも効いていた
//
// どちらも「**最初に実装したカードの効果文の都合が、器の既定の挙動になっていた**」形。
// 同じ器を複数カードが共有していて、**効果文の但し書きの有無が割れている**ものを機械的に出す。
//
// 出力は「疑い」であって不具合の断定ではない。1件ずつ効果文と実装を読んで判定すること。
// 判定済みのものは VERIFIED に理由つきで登録すれば次回から出ない。
import { loadAllCards } from "../data/loadCards"
import type { CardData } from "../server/src/type"

// 効果文に現れる「但し書き」。ここが割れている＝解釈が分岐している可能性がある
// ⚠️ **この検査の限界**（2026-08-20 に実測）：判定は効果文の**全体**に対して行うので、
// 同じカードの別ブロックにある但し書きを拾ってしまう。「コストを支払わずに」「ステップ開始時」
// 「〜できる」まで見ると誤検出が 119 件出て使いものにならなかった。
// エントリと効果文ブロックの対応付けができれば精度は上がるが、それ自体が
// scripts/check-effect-gaps.ts の領域なので、ここでは**最も誤検出が少ない1軸に絞る**。
//
// 「このスピリット以外」だけを見るなら候補は5件まで落ち、全件を人手で判定できた（下の VERIFIED）。
const MARKERS: { key: string; label: string; test: (text: string) => boolean }[] = [
    { key: "excludeSelf", label: "このスピリット以外", test: (t) => /この(スピリット|ネクサス|カード)以外/.test(t) },
]

// 「有」がこの枚数以下のときだけ報告する。
// 探しているのは「**最初に実装した少数のカードの都合が、器の既定の挙動になった**」形なので、
// 有無が半々に割れているものは器が但し書きに依存していないだけのことが多い
const MAX_WITH_MARK = 2

// 判定済み（誤検出・意図的な差）。key は "器:マーカー"
const VERIFIED = new Map<string, string>([
    ["voidCoreToOther:excludeSelf", "2026-08-20 に excludeSelf を新設して解決済み（スタッグローブのみ除外）"],
    // 以下は 2026-08-20 に1件ずつ実装を読んで「問題なし」と判定したもの
    [
        "coreSqueezeOne:excludeSelf",
        "誤検出。BS01-X02 デスペラードの「このスピリット以外」は別ブロック（coreSqueezeAll）のもので、coreSqueezeOne の節にその記載は無い",
    ],
    [
        "exhaustAll:excludeSelf",
        "正しい実装。BS05-027 ジェン・フーは filter.excludeSelf:true を持つ（TargetFilter 側で除外を表現している）",
    ],
    [
        "lifeCrush:excludeSelf",
        "誤検出。BS01-X03 キングタウロス大公の「このスピリット以外」は別ブロック（voidCoreToSelfPer）のもの",
    ],
    [
        "selfBuffPer:excludeSelf",
        "誤検出。ジェン・フーの当該ブロックは counter:{ownKeyword:soku} で、「このスピリット以外」は別ブロック",
    ],
    [
        "voidCoreToSelfPer:excludeSelf",
        "正しい実装。キングタウロス大公は counter:ownOtherSpirits（self 除外を意味する専用カウンター）を使い、他の4枚は別のカウンターを使っている",
    ],
])

interface Use {
    card: CardData
    text: string
}

const cards = loadAllCards()

// 効果エントリを再帰的に走査して、器（action.type / counter）の使用箇所を集める
function collectKeys(node: unknown, out: Set<string>): void {
    if (Array.isArray(node)) {
        for (const v of node) collectKeys(v, out)
        return
    }
    if (node === null || typeof node !== "object") return
    const obj = node as Record<string, unknown>
    if (typeof obj["type"] === "string") out.add(String(obj["type"]))
    if (typeof obj["counter"] === "string") out.add(`counter:${String(obj["counter"])}`)
    if (typeof obj["keyword"] === "string" && obj["kind"] === "keyword") out.add(`keyword:${String(obj["keyword"])}`)
    for (const v of Object.values(obj)) collectKeys(v, out)
}

const uses = new Map<string, Use[]>()
for (const card of cards) {
    const effects = card.effects ?? []
    if (effects.length === 0) continue
    const keys = new Set<string>()
    collectKeys(effects, keys)
    for (const key of keys) {
        uses.set(key, [...(uses.get(key) ?? []), { card, text: card.effect ?? "" }])
    }
}

let reported = 0
const skipped: string[] = []

for (const [key, list] of [...uses.entries()].sort()) {
    // 1枚しか使っていない器は「共有による食い違い」が起きえない
    if (list.length < 2) continue
    for (const marker of MARKERS) {
        const withMark = list.filter((u) => marker.test(u.text))
        const without = list.filter((u) => !marker.test(u.text))
        // 全部に有るか、全部に無ければ解釈は揃っている
        if (withMark.length === 0 || without.length === 0) continue
        if (withMark.length > MAX_WITH_MARK) continue
        const verifiedKey = `${key}:${marker.key}`
        if (VERIFIED.has(verifiedKey)) {
            skipped.push(`${verifiedKey}（${VERIFIED.get(verifiedKey)}）`)
            continue
        }
        reported++
        console.log(`\n■ ${key} — 「${marker.label}」の記載が割れている（有 ${withMark.length}枚 / 無 ${without.length}枚）`)
        for (const u of withMark.slice(0, 3)) console.log(`   有: ${u.card.cardId} ${u.card.name}`)
        for (const u of without.slice(0, 3)) console.log(`   無: ${u.card.cardId} ${u.card.name}`)
        if (withMark.length > 3 || without.length > 3) console.log("   …（先頭3枚のみ表示）")
    }
}

console.log(`\n---\n疑い ${reported}件（判定済みで除外したもの ${skipped.length}件）`)
for (const s of skipped) console.log(`  済: ${s}`)
console.log(
    "\n※ ここに出るのは「同じ器を共有するカードで、効果文の但し書きが割れている」ものだけ。\n" +
        "　 割れていること自体は正常なこともある（器が但し書きに依存しない場合）。実装を読んで判定すること。",
)
