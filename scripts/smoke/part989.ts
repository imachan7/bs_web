// smoke パート989（セット中のバーストは相手に伏せて見せ、発動を宣言したら cardId を公開する。BURST.md §1.4・#612）
import {
    assert,
    createGame,
    getCard,
    viewFor,
} from "./helpers"
import type { GameState } from "./helpers"
import { placeBurst } from "../../server/src/logic/EffectModules"
import { declareBurst } from "../../server/src/logic/keywords/burst"

const BURST = "BS14-030" // グラント・ベンケイ（緑・コスト5・【バースト：自分のライフ減少後】）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BURST).name === "グラント・ベンケイ" && getCard(BURST).type === "spirit", "BURSTはグラント・ベンケイ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    s.players.p2.reserve = 10
    return s
}

console.log("=== 1. セットしただけのバーストは相手に伏せたまま ===")
{
    const s = game("burst-reveal-set")
    placeBurst(s, "p2", BURST)
    const vOpp = viewFor(s, "p1")
    assert(vOpp.players.p2.burstSet === true, "相手のバーストはセット済みと見える")
    assert(vOpp.players.p2.burst === null, "相手視点ではセットしただけのバーストの cardId は null")
    assert(vOpp.players.p2.burstRevealed === false, "セットしただけでは burstRevealed は false")
    const vSelf = viewFor(s, "p2")
    assert(vSelf.players.p2.burst === BURST, "自分視点では自分のバーストの cardId が見える")
    assert(vSelf.players.p2.burstRevealed === false, "自分視点でも未発動なら burstRevealed は false")
}

console.log("=== 2. 発動を宣言したら相手にも cardId が見える ===")
{
    const s = game("burst-reveal-declared")
    placeBurst(s, "p2", BURST)
    declareBurst(s, { pid: "p2", cardId: BURST, event: "ownLifeDamaged" })
    const vOpp = viewFor(s, "p1")
    assert(vOpp.players.p2.burst === BURST, "宣言後は相手視点にも cardId が見える")
    assert(vOpp.players.p2.burstRevealed === true, "宣言後は burstRevealed が true")
    assert(viewFor(s, "p2").players.p2.burst === BURST, "宣言後は自分視点にも cardId が見える")
}

console.log("=== 3. 宣言の列から外れた後（効果の後の「コストを支払うことで」の確認の間）も、場を離れるまで公開。新しくセットしたら伏せる ===")
{
    const s = game("burst-reveal-resolving")
    placeBurst(s, "p2", BURST)
    declareBurst(s, { pid: "p2", cardId: BURST, event: "ownLifeDamaged" })
    // 適用に入ると宣言の列からは外れる（applyDeclaredBursts と同じ）。カードはまだバーストエリアにある
    s.declaredBursts = []
    const vOpp = viewFor(s, "p1")
    assert(vOpp.players.p2.burstRevealed === true && vOpp.players.p2.burst === BURST, "宣言の列から外れても、エリアにある間は相手にも見える")
    // 同じカードをもう一度伏せてセットし直したら、中身は見えない
    s.players.p2.burst = null
    s.players.p2.burstSet = false
    placeBurst(s, "p2", BURST)
    const vAfter = viewFor(s, "p1")
    assert(vAfter.players.p2.burstRevealed === false && vAfter.players.p2.burst === null, "新しくセットしたら伏せる（同じカードでも）")
}

console.log("=== 4. トラッシュに置かれたら何も見えない ===")
{
    const s = game("burst-reveal-trashed")
    placeBurst(s, "p2", BURST)
    declareBurst(s, { pid: "p2", cardId: BURST, event: "ownLifeDamaged" })
    // 発動後にトラッシュへ置かれた状態（applyDeclaredBursts の後始末と同じ形）
    s.declaredBursts = []
    delete s.currentEffectSource
    s.players.p2.trashCards.push(BURST)
    s.players.p2.burst = null
    s.players.p2.burstSet = false
    const vOpp = viewFor(s, "p1")
    assert(vOpp.players.p2.burst === null, "トラッシュ後は相手視点で cardId が無い")
    assert(vOpp.players.p2.burstRevealed === false, "トラッシュ後は burstRevealed が false")
}

console.log("すべてのチェックに合格しました 🎉（part989）")
