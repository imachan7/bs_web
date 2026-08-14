// smoke パート62（BS05 緑・白バッチ2で追加したエンジン拡張の動作確認）
//
// このパートは smoke.ts にまだ import されていない（別セッションの作業と衝突しないよう
// 新規ファイルのみ作成し、import 追加は行わない方針のため）。統合はメインループが行う。
//
// 対象の新規拡張:
// ① exhaustAll の filter（cores / excludeSelf）— BS05-027 双剣虎ジェン・フー
// ② reviveOnDestroy の familyFilter — BS05-036 氷の魔女ヘル
// ③ destroySpirit の fieldEvent selfOverride（ownSpiritDestroyed で self=破壊されたスピリット） — BS05-062 永久氷殿
// ④ magic condition ownFieldSymbolColorsAtLeast — BS05-074 ブランチロック
// ⑤（削除済み）bpBuffAllByArmorColors は 2026-07-31 に aura 方式へ移行し、
//    2026-08-10 に旧アクションを削除した。実カードでの検証は part68 にある
import { assert, act, createGame, createInstance, destroySpirit, getCard, resolveAction, runTurnStart } from "./helpers"

console.log("=== ① exhaustAll filter: cores一致・excludeSelf ===")
{
    const s = createGame("bs05-027-exhaustall", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "green" })
    const self = createInstance("BS05-027", s.turn, 1) // 自分自身（コア1個だが対象外にする）
    const ownOther1 = createInstance("BS01-001", s.turn, 1) // 自分・コア1個（対象）
    const ownOther2 = createInstance("BS01-001", s.turn, 2) // 自分・コア2個（対象外）
    s.players.p1.field.spirits.push(self, ownOther1, ownOther2)
    const enemy1 = createInstance("BS01-001", s.turn, 1) // 相手・コア1個（対象）
    const enemy2 = createInstance("BS01-001", s.turn, 2) // 相手・コア2個（対象外）
    s.players.p2.field.spirits.push(enemy1, enemy2)
    resolveAction(s, "p1", self, { type: "exhaustAll", side: "both", filter: { cores: 1, excludeSelf: true } })
    assert(self.isRested === false, "self（コア1個）は excludeSelf で対象外のまま回復状態")
    assert(ownOther1.isRested === true, "自分・コア1個は疲労した")
    assert(ownOther2.isRested === false, "自分・コア2個は対象外のまま")
    assert(enemy1.isRested === true, "相手・コア1個は疲労した")
    assert(enemy2.isRested === false, "相手・コア2個は対象外のまま")
}

console.log("=== ② reviveOnDestroy familyFilter: 系統「氷姫」以外は復活しない ===")
{
    const s = createGame("bs05-036-revive", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "white" })
    s.turnPlayer = "p1"
    s.phase = "attack"
    const hel = createInstance("BS05-036", s.turn, 4) // 氷の魔女ヘル Lv2（発生源）
    const nonIce = createInstance("BS05-028", s.turn, 1) // アーメットクラブ：系統「空魚」＝氷姫ではない
    assert(!getCard("BS05-028").family.includes("氷姫"), "テスト前提: BS05-028は系統「氷姫」を持たない")
    s.players.p1.field.spirits.push(hel, nonIce)
    const reserveBefore = s.players.p1.reserve
    destroySpirit(s, "p1", nonIce.instanceId, "destroy")
    assert(s.players.p1.trashCards.includes("BS05-028"), "系統不一致（氷姫でない）は通常どおりトラッシュへ")
    assert(s.players.p1.reserve === reserveBefore + 1, "コアはリザーブへ戻る（通常の破壊処理）")
}
{
    const s = createGame("bs05-036-revive-match", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "white" })
    s.turnPlayer = "p1"
    s.phase = "attack"
    const hel = createInstance("BS05-036", s.turn, 4) // 氷の魔女ヘル Lv2（発生源）
    // 氷姫系統を持つ破壊対象として、ヘル自身の2体目（系統は静的に「氷姫」）を使う。
    // 発生源自身は呼び出し側のループで自動的に除外される（[氷の魔女ヘル]以外＝簡略化）ため、
    // 発生源とは別インスタンスの2体目を用意する
    const hel2 = createInstance("BS05-036", s.turn, 1) // 2体目のヘル（Lv1）
    assert(getCard("BS05-036").family.includes("氷姫"), "テスト前提: BS05-036は系統「氷姫」")
    s.players.p1.field.spirits.push(hel, hel2)
    const handBefore = s.players.p1.hand.length
    destroySpirit(s, "p1", hel2.instanceId, "destroy")
    assert(s.players.p1.hand.length === handBefore + 1, "系統「氷姫」一致（2体目のヘル）は手札に戻った")
    assert(s.players.p1.field.spirits.every((sp) => sp.instanceId !== hel2.instanceId), "場からは除去されている")
    assert(
        s.players.p1.trashCards.filter((c) => c === "BS05-036").length === 0,
        "トラッシュを経由せず手札へ戻った",
    )
}

console.log("=== ③ fieldEvent selfOverride: ownSpiritDestroyedのselfは破壊されたスピリット自身 ===")
{
    const s = createGame("bs05-062-fieldevent", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "white" })
    s.turnPlayer = "p1"
    s.phase = "attack"
    const nexus = createInstance("BS05-062", s.turn, 2) // 永久氷殿 Lv2
    const iceSpirit = createInstance("BS05-036", s.turn, 4) // 系統「氷姫」・BP10000（Lv2）
    s.players.p1.field.nexuses.push(nexus)
    s.players.p1.field.spirits.push(iceSpirit)
    const lowBpEnemy = createInstance("BS01-001", s.turn, 1) // BP1000程度（破壊されたスピリットのBP以下）
    s.players.p2.field.spirits.push(lowBpEnemy)
    const enemyHandBefore = s.players.p2.hand.length
    destroySpirit(s, "p1", iceSpirit.instanceId, "destroy")
    assert(
        s.players.p2.hand.length === enemyHandBefore + 1 &&
            s.players.p2.field.spirits.every((sp) => sp.instanceId !== lowBpEnemy.instanceId),
        "破壊されたスピリットのBP以下の相手スピリットが手札に戻った（selfOverrideがネクサスのBP0でなく破壊された側のBPを参照できている）",
    )
}

console.log("=== ④ magic condition ownFieldSymbolColorsAtLeast ===")
{
    const s = createGame("bs05-074-magic-cond", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "green" })
    runTurnStart(s)
    s.players.p1.hand = ["BS05-074"]
    s.players.p1.reserve = 20
    const enemy1 = createInstance("BS01-001", s.turn, 1)
    const enemy2 = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(enemy1, enemy2)
    // シンボルが緑1色のみ（条件を満たさない）
    const greenOnly = createInstance("BS01-001", s.turn, 1)
    assert(getCard("BS01-001").symbol.length === 1 && getCard("BS01-001").symbol[0] === "red", "テスト前提: BS01-001は赤シンボル")
    s.players.p1.field.spirits.push(greenOnly)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ブランチロックを使用（シンボル1色）")
    assert(enemy1.isRested === false && enemy2.isRested === false, "シンボル1色のときは疲労させない（不発）")
}
{
    const s = createGame("bs05-074-magic-cond-ok", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "green" })
    runTurnStart(s)
    s.players.p1.hand = ["BS05-074"]
    s.players.p1.reserve = 20
    const enemy1 = createInstance("BS01-001", s.turn, 1)
    const enemy2 = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(enemy1, enemy2)
    const redSymbol = createInstance("BS01-001", s.turn, 1) // 赤シンボル
    const whiteSymbol = createInstance("BS05-028", s.turn, 1) // 白シンボル
    s.players.p1.field.spirits.push(redSymbol, whiteSymbol)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ブランチロックを使用（シンボル2色）")
    assert(enemy1.isRested === true && enemy2.isRested === true, "シンボル2色以上のときは相手2体が疲労する")
}

