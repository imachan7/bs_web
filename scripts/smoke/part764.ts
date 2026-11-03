// smoke パート764（BS16-044 ダイヤプリンセス・ドロシー『このスピリットの召喚時』の場面テスト）
// 期待値は効果文と属性だけから書いた。「オープンできる」は任意、「四道を持つスピリットカード2枚までを、コストを支払わずに召喚」、
// 召喚したスピリットの『このスピリットの召喚時』は発揮されない、残りは破棄。
// 召喚で置くコア（Lv1のコア）はリザーブから置く前提で書いてある（効果文には書かれていない一般則の推定）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const DOROTHY = "BS16-044"
const PAN = "BS02-066" // アルカナドール・パン（四道・コスト4）。召喚時に相手のスピリットを疲労させる効果あり
const TORIA = "BS03-054" // アルカナドール・トリア（四道・コスト3）
const HARUTO = "BS04-051" // アルカナビースト・ハルト（四道・コスト4）。開き直したときの破棄候補
const VANILLA = "BS01-002" // ロクケラトプス（赤・地竜・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(DOROTHY).name === "ダイヤプリンセス・ドロシー" && getCard(DOROTHY).cost === 6, "DOROTHYはダイヤプリンセス・ドロシー（コスト6）")
    assert(getCard(PAN).name === "アルカナドール・パン" && getCard(PAN).family.includes("四道"), "PANは四道のアルカナドール・パン")
    assert(getCard(TORIA).name === "アルカナドール・トリア" && getCard(TORIA).family.includes("四道"), "TORIAは四道のアルカナドール・トリア")
    assert(getCard(HARUTO).name === "アルカナビースト・ハルト" && getCard(HARUTO).family.includes("四道"), "HARUTOは四道のアルカナビースト・ハルト")
    assert(getCard(VANILLA).name === "ロクケラトプス" && !getCard(VANILLA).family.includes("四道"), "VANILLAは四道でない")
}

// 山札の上から6枚を、四道2枚（パン・トリア）・四道1枚（ハルト）・四道でないカード3枚にする
const TOP6 = [PAN, HARUTO, TORIA, VANILLA, VANILLA, VANILLA]
const DECK = [...TOP6, ...Array.from({ length: 34 }, () => VANILLA)]

// 確認（kind:"option"）と選択（kind:"card"）に答える。回数は10回まで。
// picks に並べたカードを順に選び、残りは止める（skip）。accept=false なら「発動しない」で断る
function answer(t: Parameters<Parameters<typeof scenario>[0]["steps"]>[0], accept: boolean, picks: string[]): void {
    let next = 0
    for (let i = 0; i < 10 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        if (pc.kind === "option") {
            const label = accept ? pc.options?.find((o) => o.includes("発動する")) : undefined
            t.act("me", label === undefined ? { type: "resolveChoice" } : { type: "resolveChoice", option: label })
            continue
        }
        if (pc.kind === "card" && next < picks.length) {
            const idx = pc.cardIndices?.find((j) => t.state.revealedCards?.cardIds[j] === picks[next])
            assert(idx !== undefined, `選択肢に${getCard(picks[next]!).name}がいない`)
            t.act("me", { type: "resolveChoice", cardIndex: idx! })
            next++
            continue
        }
        t.act("me", { type: "resolveChoice" }) // 残りを選ばずに止める
    }
    assert(t.state.pendingChoice === null, "確認・選択が10回以内に閉じる")
}

const OPP_TARGET = { card: VANILLA, label: "敵" } // PANの召喚時が発揮されたら疲労する相手のスピリット

console.log("=== 1. 確認で断ると、デッキは減らず何も起きない（召喚はされる） ===")
scenario({
    name: "dorothy-decline-open",
    start: {
        interactive: true,
        me: { hand: [DOROTHY], deck: DECK, reserve: 10, spirits: [] },
        opp: { spirits: [OPP_TARGET] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        answer(t, false, [])
    },
    expect: [
        "自分.手札: ダイヤプリンセス・ドロシー → なし",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        "自分.ダイヤプリンセス・ドロシー.場所: なし → フィールド",
        "自分.ダイヤプリンセス・ドロシー.疲労: なし → false",
        "自分.ダイヤプリンセス・ドロシー.コア: なし → 1",
        "自分.ダイヤプリンセス・ドロシー.Lv: なし → 1",
        "自分.ダイヤプリンセス・ドロシー.BP: なし → 4000",
    ],
})

console.log("=== 2. 6枚オープンし、四道を2枚選んで召喚。召喚したスピリットの召喚時は発揮されず、残りは破棄 ===")
scenario({
    name: "dorothy-open-pick-two",
    start: {
        interactive: true,
        me: { hand: [DOROTHY], deck: DECK, reserve: 10, spirits: [] },
        opp: { spirits: [OPP_TARGET] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        answer(t, true, [PAN, TORIA])
    },
    expect: [
        "自分.手札: ダイヤプリンセス・ドロシー → なし",
        "自分.リザーブ: 10 → 1",
        "自分.トラッシュのコア: 0 → 6",
        "自分.デッキ枚数: 40 → 34",
        "自分.トラッシュ: なし → アルカナビースト・ハルト、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "自分.ダイヤプリンセス・ドロシー.場所: なし → フィールド",
        "自分.ダイヤプリンセス・ドロシー.疲労: なし → false",
        "自分.ダイヤプリンセス・ドロシー.コア: なし → 1",
        "自分.ダイヤプリンセス・ドロシー.Lv: なし → 1",
        "自分.ダイヤプリンセス・ドロシー.BP: なし → 4000",
        "自分.アルカナドール・パン.場所: なし → フィールド",
        "自分.アルカナドール・パン.疲労: なし → false",
        "自分.アルカナドール・パン.コア: なし → 1",
        "自分.アルカナドール・パン.Lv: なし → 1",
        "自分.アルカナドール・パン.BP: なし → 2000",
        "自分.アルカナドール・トリア.場所: なし → フィールド",
        "自分.アルカナドール・トリア.疲労: なし → false",
        "自分.アルカナドール・トリア.コア: なし → 1",
        "自分.アルカナドール・トリア.Lv: なし → 1",
        "自分.アルカナドール・トリア.BP: なし → 2000",
    ],
})

console.log("=== 3. 四道を1枚選んだところでやめる（途中でやめられる）。残りは破棄 ===")
scenario({
    name: "dorothy-open-pick-one-then-stop",
    start: {
        interactive: true,
        me: { hand: [DOROTHY], deck: DECK, reserve: 10, spirits: [] },
        opp: { spirits: [OPP_TARGET] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        answer(t, true, [PAN])
    },
    expect: [
        "自分.手札: ダイヤプリンセス・ドロシー → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 6",
        "自分.デッキ枚数: 40 → 34",
        "自分.トラッシュ: なし → アルカナドール・トリア、アルカナビースト・ハルト、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "自分.ダイヤプリンセス・ドロシー.場所: なし → フィールド",
        "自分.ダイヤプリンセス・ドロシー.疲労: なし → false",
        "自分.ダイヤプリンセス・ドロシー.コア: なし → 1",
        "自分.ダイヤプリンセス・ドロシー.Lv: なし → 1",
        "自分.ダイヤプリンセス・ドロシー.BP: なし → 4000",
        "自分.アルカナドール・パン.場所: なし → フィールド",
        "自分.アルカナドール・パン.疲労: なし → false",
        "自分.アルカナドール・パン.コア: なし → 1",
        "自分.アルカナドール・パン.Lv: なし → 1",
        "自分.アルカナドール・パン.BP: なし → 2000",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part764）")
