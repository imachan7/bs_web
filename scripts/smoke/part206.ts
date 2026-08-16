// smoke パート206（「できる」なのに自動発動していたカードをconfirm式に直す・15枚のうち代表3枚）
//
// 2026-08-15/16 ユーザー確認済みの方針: 効果文が「〜できる」なら実対戦では発動確認を出す。
// エンジン側は対応済み（interactiveTargets時のみ確認。非対話＝smokeでは従来どおり自動発動）ため、
// カード側に optional:true を足すだけでよい。ここでは代表3枚（BS02-013／BS02-034／BS05-066）で、
// 非対話では挙動が変わらないこと、対話では発動確認→スキップ/発動の両方を確認する。
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== BS02-013 バット・バット：非対話では従来どおり自動でコアを移す ===")
{
    const s = createGame("part206-batbat-auto", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const batbat = put(s, "p1", "BS02-013", 3) // Lv2（onBlocked有効）
    const blocker = put(s, "p2", "BS01-001", 2)
    const reserveBefore = s.players.p2.reserve

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: batbat.instanceId }) === null, "バット・バットでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ゴラドンでブロック")
    assert(s.pendingChoice === null, "非対話なのでpendingChoiceは立たない")
    assert(blocker.cores === 1, "ブロッカーのコアが1個減る")
    assert(s.players.p2.reserve === reserveBefore + 1, "減ったコアが相手リザーブへ加算される")
}

console.log("=== BS02-013 バット・バット：対話時は発動確認が立ち、スキップすると発動しない ===")
{
    const s = createGame("part206-batbat-skip", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    const batbat = put(s, "p1", "BS02-013", 3)
    const blocker = put(s, "p2", "BS01-001", 2)
    const reserveBefore = s.players.p2.reserve

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: batbat.instanceId }) === null, "バット・バットでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ゴラドンでブロック")
    assert(s.pendingChoice?.confirm === true, "「できる」効果なので発動確認が立つ")
    assert(s.pendingChoice?.optional === true, "発動確認はスキップ可")

    assert(act(s, "p1", { type: "resolveChoice" }) === null, "発動しないことを選ぶ")
    assert(s.pendingChoice === null, "選択は解消される")
    assert(blocker.cores === 2, "コアは移らない")
    assert(s.players.p2.reserve === reserveBefore, "相手リザーブも変わらない")
}

console.log("=== BS02-013 バット・バット：対話時に発動を選ぶとコアが移る ===")
{
    const s = createGame("part206-batbat-confirm", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    const batbat = put(s, "p1", "BS02-013", 3)
    const blocker = put(s, "p2", "BS01-001", 2)
    const reserveBefore = s.players.p2.reserve

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: batbat.instanceId }) === null, "バット・バットでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ゴラドンでブロック")
    assert(s.pendingChoice?.confirm === true, "発動確認が立つ")

    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動を選ぶ")
    assert(s.pendingChoice === null, "候補1件のため選択なしで解決される")
    assert(blocker.cores === 1, "ブロッカーのコアが1個減る")
    assert(s.players.p2.reserve === reserveBefore + 1, "減ったコアが相手リザーブへ加算される")
}

console.log("=== BS02-034 老賢樹トレントン：非対話では従来どおり自動で無料召喚する ===")
{
    const s = createGame("part206-trenton-auto", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.hand = ["BS02-034", "BS01-061"] // 老賢樹トレントン／エイプウィップ（緑）
    s.players.p1.reserve = 20

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "老賢樹トレントンを召喚")
    assert(s.pendingChoice === null, "非対話なのでpendingChoiceは立たない")
    assert(
        s.players.p1.field.spirits.some((i) => i.cardId === "BS01-061"),
        "エイプウィップが自動で無料召喚される",
    )
}

console.log("=== BS02-034 老賢樹トレントン：対話時は発動確認が立ち、スキップすると無料召喚されない ===")
{
    const s = createGame("part206-trenton-skip", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p1.hand = ["BS02-034", "BS01-061"]
    s.players.p1.reserve = 20
    const handBefore = [...s.players.p1.hand]

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "老賢樹トレントンを召喚")
    assert(s.pendingChoice?.confirm === true, "「できる」効果なので発動確認が立つ")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "発動しないことを選ぶ")
    assert(s.pendingChoice === null, "選択は解消される")
    assert(
        !s.players.p1.field.spirits.some((i) => i.cardId === "BS01-061"),
        "エイプウィップは召喚されない",
    )
    assert(
        s.players.p1.hand.length === handBefore.length - 1 && s.players.p1.hand.includes("BS01-061"),
        "召喚したトレントン以外は手札に残る",
    )
}

console.log("=== BS02-034 老賢樹トレントン：対話時に発動を選ぶと無料召喚される ===")
{
    const s = createGame("part206-trenton-confirm", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p1.hand = ["BS02-034", "BS01-061"]
    s.players.p1.reserve = 20

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "老賢樹トレントンを召喚")
    assert(s.pendingChoice?.confirm === true, "発動確認が立つ")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動を選ぶ")
    assert(s.pendingChoice === null, "候補1件のため選択なしで解決される")
    assert(
        s.players.p1.field.spirits.some((i) => i.cardId === "BS01-061"),
        "エイプウィップが無料召喚される",
    )
}

console.log("=== BS05-066 天焦がす大聖火：非対話では従来どおり自動でデッキ上1枚を公開する ===")
{
    const s = createGame("part206-bonfire-auto", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS05-066", 0) // Lv1
    const blueSpirit = put(s, "p1", "BS03-071", 1)
    s.players.p1.deck.unshift("BS05-033") // 巨人機ユミール
    const handBefore = s.players.p1.hand.length

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: blueSpirit.instanceId }) === null, "青スピリットでアタック")
    assert(s.pendingChoice === null, "非対話なのでpendingChoiceは立たない")
    assert(s.players.p1.hand.includes("BS05-033"), "「巨人」を含むスピリットカードは手札に加わる")
    assert(s.players.p1.hand.length === handBefore + 1, "手札が1枚増える")
}

console.log("=== BS05-066 天焦がす大聖火：対話時は発動確認が立ち、スキップするとデッキが公開されない ===")
{
    const s = createGame("part206-bonfire-skip", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    putNexus(s, "p1", "BS05-066", 0)
    const blueSpirit = put(s, "p1", "BS03-071", 1)
    s.players.p1.deck.unshift("BS05-033")
    const deckBefore = [...s.players.p1.deck]
    const handBefore = s.players.p1.hand.length

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: blueSpirit.instanceId }) === null, "青スピリットでアタック")
    assert(s.pendingChoice?.confirm === true, "「できる」効果なので発動確認が立つ")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "発動しないことを選ぶ")
    assert(s.pendingChoice === null, "選択は解消される")
    assert(
        s.players.p1.deck.length === deckBefore.length && s.players.p1.deck[0] === "BS05-033",
        "デッキは公開されず先頭のカードも変わらない",
    )
    assert(s.players.p1.hand.length === handBefore, "手札も増えない")
}

console.log("=== BS05-066 天焦がす大聖火：対話時に発動を選ぶとデッキ上1枚が公開される ===")
{
    const s = createGame("part206-bonfire-confirm", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    putNexus(s, "p1", "BS05-066", 0)
    const blueSpirit = put(s, "p1", "BS03-071", 1)
    s.players.p1.deck.unshift("BS05-033")
    const handBefore = s.players.p1.hand.length

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: blueSpirit.instanceId }) === null, "青スピリットでアタック")
    assert(s.pendingChoice?.confirm === true, "発動確認が立つ")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動を選ぶ")
    assert(s.pendingChoice === null, "確認後そのまま解決される")
    assert(s.players.p1.hand.includes("BS05-033"), "「巨人」を含むスピリットカードは手札に加わる")
    assert(s.players.p1.hand.length === handBefore + 1, "手札が1枚増える")
}
