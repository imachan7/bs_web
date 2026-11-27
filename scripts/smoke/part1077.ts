// smoke パート1077（アルティメットの土台 段6a：【Uトリガー】。docs/design/ULTIMATE_STAGE6.md・ULTIMATE_PLAN C1〜C13）
import { assert, createGame, createInstance, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import { CARD_DB } from "../../server/src/logic/GameState"

const BASE = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const lv = [{ level: 3, cores: 1, bp: 5000 }, { level: 4, cores: 3, bp: 7000 }]
const vanilla = (id: string, cost: number, extra: object = {}): string => {
    CARD_DB.set(id, { ...getCard(BASE), cardId: id, cost, ...extra })
    return id
}
// デッキの札（印刷コスト n）／ガード札（ultimateMaxCost 以下のアルティメットのUトリガーをガードする）
const D = (n: number): string => vanilla(`TEST-D${n}`, n)
const GUARD7 = vanilla("TEST-G7", 2, { effects: [{ id: "TEST-G7-e1", kind: "uTriggerGuard", levels: null, ultimateMaxCost: 7 }] })
const GUARDANY = vanilla("TEST-GA", 2, { effects: [{ id: "TEST-GA-e1", kind: "uTriggerGuard", levels: null }] })

const destroyOne: EffectAction = { type: "destroy", count: 1 }
const draw = (n: number): EffectAction => ({ type: "draw", count: n })
let seq = 0
// 『アタック時』に uTrigger を発揮するアルティメット（偽）。合体（ブレイヴ加算）はコストの増減で代用する
function mkUlt(cost: number, count: number, hit: EffectAction[], hitBonus?: { need: number | "all"; actions: EffectAction[] }[], tail: EffectAction[] = [], costDelta = 0): string {
    const id = `TEST-U${++seq}`
    const uTrigger: EffectAction = { type: "uTrigger", count, hit, ...(hitBonus ? { hitBonus } : {}) }
    const action: EffectAction = tail.length > 0 ? { type: "sequence", actions: [uTrigger, ...tail] } : uTrigger
    CARD_DB.set(id, { ...getCard(BASE), cardId: id, type: "ultimate", cost, levels: lv, effects: [{ id: `${id}-e1`, kind: "triggered", trigger: "onAttack", levels: null, action }, ...(costDelta !== 0 ? [{ id: `${id}-e2`, kind: "costDelta", levels: null, target: "self", amount: costDelta }] : [])] as never })
    return id
}
// 派生を見張る自分のスピリット（偽）。ヒット＝1枚・ガード＝3枚・発揮後＝9枚ドロー（手札の増え方から、どれが出たか読む）
const WATCH = (() => {
    const id = "TEST-W"
    const fe = (event: string, n: number) => ({ id: `${id}-${event}`, kind: "fieldEvent", event, levels: null, action: draw(n) })
    CARD_DB.set(id, { ...getCard(BASE), cardId: id, effects: [fe("ownUTriggerHit", 1), fe("ownUTriggerGuarded", 3), fe("ownUTriggered", 9)] as never })
    return id
})()
// 手札の増えた枚数 → 発火した派生（1=ヒット・3=ガード・9=発揮後）。例：10 → "ヒット+発揮後"
function fired(delta: number): string {
    const names: string[] = []
    if (delta >= 9) { names.unshift("発揮後"); delta -= 9 }
    if (delta >= 3) { names.unshift("ガード"); delta -= 3 }
    if (delta >= 1) names.unshift("ヒット")
    return names.join("+")
}

type Scene = { s: GameState; ult: ReturnType<typeof createInstance>; oppDeck: string[] }
function scene(seed: string, ultId: string, oppDeck: string[], oppSpirits = 1, watch = true): Scene {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.deck = Array.from({ length: 60 }, () => BASE)
    s.players.p1.hand = []
    s.players.p2.deck = [...oppDeck]
    s.players.p2.trashCards = []
    s.players.p1.field.spirits = watch ? [createInstance(WATCH, 1, 1)] : []
    s.players.p2.field.spirits = Array.from({ length: oppSpirits }, () => createInstance(BASE, 1, 1))
    const ult = createInstance(ultId, 1, 1)
    s.players.p1.field.ultimates = [ult]
    return { s, ult, oppDeck }
}
const attack = (sc: Scene): void => {
    const err = handleAction(sc.s, "p1", { type: "attack", instanceId: sc.ult.instanceId } as never)
    assert(err === null || err === undefined || typeof err !== "string", `（前提）アタックできる ${String(err)}`)
}
const handOf = (sc: Scene) => sc.s.players.p1.hand.length
const trashOf = (sc: Scene) => sc.s.players.p2.trashCards
const oppSpirits = (sc: Scene) => sc.s.players.p2.field.spirits.length

try {
    console.log("=== 段1 置く（C1・C2） ===")
    {
        const sc = scene("u1-a", mkUlt(5, 2, []), [D(1), D(2), D(3)])
        attack(sc)
        assert(trashOf(sc).length === 2 && sc.s.players.p2.deck.length === 1, "WU：デッキの上から2枚がトラッシュへ")
        assert(trashOf(sc)[0] === "TEST-D1" && trashOf(sc)[1] === "TEST-D2", "上の札から順に置かれる")
    }
    {
        const sc = scene("u1-b", mkUlt(5, 3, []), [D(1), D(2)])
        attack(sc)
        assert(trashOf(sc).length === 2 && sc.s.players.p2.deck.length === 0, "デッキが足りないときは残り全部だけ置く（TU・デッキ2枚）")
    }
    {
        // C2：デッキ破棄を禁じられていても置ける・破棄の誘発・【強化】・破棄税は関係しない
        const sc = scene("u1-c", mkUlt(5, 1, []), [D(1), D(1)])
        sc.s.players.p2.field.spirits.push(createInstance(vanilla("TEST-NOMILL", 1, { effects: [{ id: "TEST-NOMILL-e1", kind: "deckMillNegate", levels: null }] }), 1, 1))
        const before = sc.s.log.length
        attack(sc)
        assert(trashOf(sc).length === 1, "デッキ破棄を無効にする相手にも置ける")
        assert(!sc.s.log.slice(before).some((l) => l.includes("デッキを上から")), "デッキ破棄の経路（millDeck）を通らない")
    }
    {
        const sc = scene("u1-d", mkUlt(5, 1, []), [D(1), D(1)], 1, false)
        const watcher = createInstance(vanilla("TEST-MILLW", 1, { effects: [{ id: "TEST-MILLW-e1", kind: "fieldEvent", event: "opponentDeckMilled", levels: null, action: draw(4) }] }), 1, 1)
        sc.s.players.p1.field.spirits.push(watcher)
        attack(sc)
        assert(trashOf(sc).length === 1 && handOf(sc) === 0, "「相手のデッキが破棄されたとき」の誘発は出ない")
    }

    console.log("=== 段2 判定（C3）：置いた札のコスト < アルティメットのコスト ===")
    {
        const sc = scene("u2-a", mkUlt(5, 1, [draw(2)]), [D(3)], 1, false)
        attack(sc)
        assert(handOf(sc) === 2, "コスト3の札・コスト5でヒット")
    }
    {
        const sc = scene("u2-b", mkUlt(5, 1, [draw(2)]), [D(5)], 1, false)
        attack(sc)
        assert(handOf(sc) === 0, "コスト5の札・コスト5はヒットしない（同じはヒットしない）")
    }
    {
        const sc = scene("u2-c", mkUlt(5, 1, [draw(2)]), [D(6)], 1, false)
        attack(sc)
        assert(handOf(sc) === 0, "コスト6の札・コスト5はヒットしない")
    }
    {
        // 合体前はヒットしない／合体後（コスト加算）はヒットする。ブレイヴの加算は自身の kind:"costDelta" で代用（braveComposite は field.spirits のホストにしか作られない）
        const sc = scene("u2-d", mkUlt(5, 1, [draw(2)], undefined, [], 2), [D(6)], 1, false)
        attack(sc)
        assert(handOf(sc) === 2, "コストが7になっていればコスト6の札にヒットする")
    }
    {
        const sc = scene("u2-e", mkUlt(5, 1, [draw(2)], undefined, [], -2), [D(3)], 1, false)
        attack(sc)
        assert(handOf(sc) === 0, "コストが3に減っていればコスト3の札はヒットしない")
    }

    console.log("=== ガード（C4） ===")
    {
        const sc = scene("g-a", mkUlt(5, 1, [draw(2)]), [GUARD7])
        attack(sc)
        assert(fired(handOf(sc)) === "ガード+発揮後" && handOf(sc) === 12, `コスト7以下のアルティメットにはガード札が効き、ヒット効果は出ず「ガードされたとき」「発揮後」が出る（${fired(handOf(sc))}）`)
    }
    {
        const sc = scene("g-b", mkUlt(8, 1, [draw(2)]), [GUARD7])
        attack(sc)
        assert(fired(handOf(sc) - 2) === "ヒット+発揮後", `コスト8のアルティメットにはコスト7以下限定のガード札が効かず、通常どおりヒットする（${handOf(sc)}）`)
    }

    console.log("=== ダブルヒット・トリプルヒット（C5） ===")
    const bonus20 = (need: number | "all") => [{ need, actions: [draw(20)] }]
    for (const [name, count, need, deck, expected] of [
        ["WU 2枚ヒットでダブルヒット", 2, 2, [D(1), D(1)], 20],
        ["WU 1枚だけヒットならダブルヒットなし", 2, 2, [D(1), D(9)], 0],
        ["WU 0枚ヒットでもなし", 2, 2, [D(9), D(9)], 0],
        ["TU 3枚すべてヒットでトリプル", 3, "all", [D(1), D(1), D(1)], 20],
        ["TU 2枚ヒットではトリプルなし", 3, "all", [D(1), D(1), D(9)], 0],
        ["TU 2枚ヒットでダブル（need 2）は出る", 3, 2, [D(1), D(1), D(9)], 20],
        ["デッキが足りず2枚しか置けない TU は「すべて」にならない", 3, "all", [D(1), D(1)], 0],
    ] as const) {
        const sc = scene(`c5-${name}`, mkUlt(5, count, [], bonus20(need)), [...deck], 1, false)
        attack(sc)
        assert(handOf(sc) === expected, `${name}（手札+${handOf(sc)}）`)
    }
    {
        // C4：ガード札が混じるとヒット効果と「ガードされたとき」は出るが、ダブルヒットは出ない
        const sc = scene("c5-g", mkUlt(5, 2, [draw(2)], bonus20(2)), [GUARD7, D(1)])
        attack(sc)
        assert(fired(handOf(sc) - 2) === "ヒット+ガード+発揮後" && handOf(sc) === 15, `WU：ガード札＋ヒット札 → ヒット効果と3つの派生は出るがダブルヒットは出ない（${handOf(sc)}）`)
    }
    {
        const sc = scene("c5-g2", mkUlt(5, 2, [draw(2)], bonus20(2)), [GUARDANY, GUARDANY])
        attack(sc)
        assert(fired(handOf(sc)) === "ガード+発揮後" && handOf(sc) === 12, "全部ガード札ならヒット効果もダブルヒットも出ず、ガード＋発揮後だけ")
    }

    console.log("=== 段4 ヒット効果の前に場を離れた（C12） ===")
    {
        const sc = scene("leave", mkUlt(5, 1, [{ type: "destroy", target: "self" } as never, draw(2)]), [D(1)])
        attack(sc)
        assert(sc.s.players.p1.field.ultimates.length === 0, "（前提）アルティメットは自分の効果で破壊された")
        assert(fired(handOf(sc)) === "発揮後" || fired(handOf(sc) - 2) === "発揮後", `場を離れたら「ヒットしたとき」「ガードされたとき」は出ず「発揮後」だけ出る（${handOf(sc)}）`)
    }

    console.log("=== C11 破壊したとき1回 ===")
    const DW = vanilla("TEST-DW", 1, { effects: [{ id: "TEST-DW-e1", kind: "fieldEvent", event: "opponentSpiritDestroyed", levels: null, action: draw(4) }] })
    {
        // 1回の破壊（1つの action の複数対象）は同時破壊の1グループ。ヒット効果の中身は uTrigger の effectId のまま出口で解決する
        const sc = scene("c11", mkUlt(5, 1, [{ type: "destroy", count: 2 }]), [D(1)], 2, false)
        sc.s.players.p1.field.spirits.push(createInstance(DW, 1, 1))
        attack(sc)
        assert(oppSpirits(sc) === 0 && handOf(sc) === 4, `ヒット効果で2体破壊 → 「破壊したとき」は1回（手札+${handOf(sc)}）`)
    }
    {
        const sc = scene("c11b", mkUlt(5, 2, [destroyOne], [{ need: 2, actions: [destroyOne] }]), [D(1), D(1)], 2, false)
        attack(sc)
        assert(oppSpirits(sc) === 0, "ダブルヒットの追加の破壊もヒット効果と同じ列で行われる")
        const t = scene("c11c", mkUlt(5, 2, [destroyOne], [{ need: 2, actions: [destroyOne] }]), [D(1), D(9)], 2, false)
        attack(t)
        assert(oppSpirits(t) === 1, "1枚だけヒットなら追加の破壊は出ない")
    }

    console.log("=== C13 相手のデッキが0枚 ===")
    {
        const sc = scene("c13", mkUlt(5, 2, [draw(2)], bonus20(2)), [])
        attack(sc)
        assert(trashOf(sc).length === 0 && fired(handOf(sc)) === "発揮後" && handOf(sc) === 9, `何も置かず、ヒット効果もヒットしたときも出ず、「発揮後」だけ出る（${handOf(sc)}）`)
        assert(sc.s.winner === undefined || sc.s.winner === null, "デッキ0枚で負けない")
    }

    console.log("=== 派生3つ ===")
    {
        const sc = scene("d-hit", mkUlt(5, 1, [destroyOne], undefined, [draw(5)]), [D(1)])
        attack(sc)
        const log = sc.s.log
        const iDestroy = log.findIndex((l) => l.includes("破壊された"))
        const iTail = log.findIndex((l) => l.includes("5枚ドロー"))
        const iHit = log.findIndex((l, i) => i > iTail && l.includes("1枚ドロー"))
        const iAfter = log.findIndex((l, i) => i > iTail && l.includes("9枚ドロー"))
        assert(iDestroy >= 0 && iDestroy < iTail && iTail < iHit && iHit < iAfter, `ヒット効果の破壊 → 効果の残り → 「ヒットしたとき」 → 「発揮後」の順に解決する（${iDestroy},${iTail},${iHit},${iAfter}）`)
        assert(fired(handOf(sc) - 5) === "ヒット+発揮後", "ヒットなら「ヒットしたとき」と「発揮後」が出て、「ガードされたとき」は出ない")
    }
    {
        const sc = scene("d-miss", mkUlt(5, 2, [draw(2)]), [D(9), D(5)])
        attack(sc)
        assert(handOf(sc) === 9, `全部ミスなら「発揮後」だけ（${handOf(sc)}）`)
    }
}
finally {
    // 後始末は不要（偽カードは CARD_DB のみ）
}
console.log("すべてのチェックに合格しました 🎉（part1077）")
