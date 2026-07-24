// smoke パート22（第三弾 BS03 エンジン拡張バッチ：EffectCounter統一・colorFilter付与・exhaust levelFilter）
import {
    act,
    assert,
    createGame,
    createInstance,
    resolveAction,
    runTurnStart,
} from "./helpers"
import { fireTrigger } from "../../server/src/logic/EffectModules"

console.log("=== BS03-031 黒風のパンター：selfBuffPer counter=ownReserve（新カウンタ経路） ===")
{
    const s = createGame(
        "bs03-031-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const panther = createInstance("BS03-031", s.turn, 3) // Lv2 cores3 bp5000
    s.players.p1.field.spirits.push(panther)
    s.players.p1.reserve = 3
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: panther.instanceId }) === null, "パンターでアタック")
    assert(panther.tempBpBuff === 3000, "リザーブ3個×1000でBP+3000")
}

console.log("--- BS03-031：リザーブ0なら増加しない ---")
{
    const s = createGame(
        "bs03-031-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const panther = createInstance("BS03-031", s.turn, 3)
    s.players.p1.field.spirits.push(panther)
    s.players.p1.reserve = 0
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: panther.instanceId }) === null, "パンターでアタック")
    assert(panther.tempBpBuff === 0, "リザーブ0なら増加しない")
}

console.log("=== BS03-046 一角獣アインホルン：selfBuffPer counter=ownNexuses（ブロック時） ===")
{
    const s = createGame(
        "bs03-046-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const horn = createInstance("BS03-046", s.turn, 1) // Lv1 cores1
    s.players.p2.field.spirits.push(horn)
    s.players.p2.field.nexuses.push(
        createInstance("BS01-106", s.turn, 0),
        createInstance("BS01-106", s.turn, 0),
    )
    const atk = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(atk)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: horn.instanceId }) === null, "アインホルンでブロック")
    assert(horn.tempBpBuff === 2000, "自分のネクサス2つ×1000でBP+2000")
}

console.log("=== BS03-036 神鳥ピーゴッド：selfBuffPer counter={ownFamily:爪鳥}（アタック時） ===")
{
    const s = createGame(
        "bs03-036-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const piigod = createInstance("BS03-036", s.turn, 4) // Lv2 cores4 bp7000
    s.players.p1.field.spirits.push(piigod)
    const ally = createInstance("BS03-034", s.turn, 1) // 闘鶏ビシャモン：系統「爪鳥」
    s.players.p1.field.spirits.push(ally)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: piigod.instanceId }) === null, "ピーゴッドでアタック")
    assert(piigod.tempBpBuff === 2000, "自身含む「爪鳥」2体×1000でBP+2000")
}

console.log("=== BS03-048 鎧蛇竜ミッドガルズ：selfBuffPer counter={ownFamily:巨獣}（ブロック時・未構造化分の追加） ===")
{
    const s = createGame(
        "bs03-048-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const midgard = createInstance("BS03-048", s.turn, 1) // Lv1 cores1：系統「甲竜」「巨獣」
    s.players.p2.field.spirits.push(midgard)
    const atk = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(atk)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: midgard.instanceId }) === null, "ミッドガルズでブロック")
    assert(midgard.tempBpBuff === 1000, "自身が「巨獣」1体分でBP+1000（Lv2破壊耐性のonBattleと共存）")
}

console.log("=== BS03-030 調教師ライナ兄弟：voidCoreToSelfPer counter=ownNexuses（召喚時） ===")
{
    const s = createGame(
        "bs03-030-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const lyna = createInstance("BS03-030", s.turn, 1) // Lv1 cores1
    s.players.p1.field.spirits.push(lyna)
    s.players.p1.field.nexuses.push(
        createInstance("BS01-106", s.turn, 0),
        createInstance("BS01-106", s.turn, 0),
    )
    fireTrigger(s, "p1", lyna, "onSummon")
    assert(lyna.cores === 3, "維持コア1＋ネクサス2つぶんでコア3個になる")
}

console.log("=== BS03-128 マルチプルコア：coreGainPer counter=ownExhausted（フラッシュ） ===")
{
    const s = createGame(
        "bs03-128-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const rested1 = createInstance("BS01-001", s.turn, 1)
    const rested2 = createInstance("BS01-001", s.turn, 1)
    rested1.isRested = true
    rested2.isRested = true
    s.players.p1.field.spirits.push(rested1, rested2)
    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p1", null, { type: "coreGainPer", counter: "ownExhausted" })
    assert(s.players.p1.reserve === reserveBefore + 2, "疲労スピリット2体ぶんボイドからリザーブへ+2")
}

console.log("=== BS03-032 蜘蛛女アラクネット：exhaust levelFilter=[1]（アタック時、相手のLv1限定） ===")
{
    const s = createGame(
        "bs03-032-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const arachne = createInstance("BS03-032", s.turn, 3) // Lv2 cores3
    s.players.p1.field.spirits.push(arachne)
    const enemyLv1 = createInstance("BS01-001", s.turn, 1) // Lv1
    const enemyLv2 = createInstance("BS01-001", s.turn, 3) // Lv2
    s.players.p2.field.spirits.push(enemyLv1, enemyLv2)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: arachne.instanceId }) === null, "アラクネットでアタック")
    assert(enemyLv1.isRested === true, "相手のLv1スピリットは疲労する")
    assert(enemyLv2.isRested === false, "相手のLv2スピリットはlevelFilter対象外で疲労しない")
}

console.log("=== BS03-X10 凍獣マン・モール：effectGrant colorFilter=white（ブロック時、白のみ+2000） ===")
{
    const s = createGame(
        "bs03-x10-white-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const manmoll = createInstance("BS03-X10", s.turn, 1) // Lv1 cores1
    s.players.p2.field.spirits.push(manmoll)
    const whiteAlly = createInstance("BS01-093", s.turn, 1) // 甲精ディース：白
    s.players.p2.field.spirits.push(whiteAlly)
    const atk = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(atk)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: whiteAlly.instanceId }) === null, "白のスピリットでブロック")
    assert(whiteAlly.tempBpBuff === 2000, "白のスピリットはブロック時+2000される")
}

console.log("--- BS03-X10：白以外のスピリットは付与されない ---")
{
    const s = createGame(
        "bs03-x10-nonwhite-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "white" },
    )
    runTurnStart(s)
    const manmoll = createInstance("BS03-X10", s.turn, 1)
    s.players.p2.field.spirits.push(manmoll)
    const redAlly = createInstance("BS01-001", s.turn, 1) // ゴラドン：赤（tempColorsも無し）
    s.players.p2.field.spirits.push(redAlly)
    const atk = createInstance("BS03-034", s.turn, 1)
    s.players.p1.field.spirits.push(atk)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: redAlly.instanceId }) === null, "赤のスピリットでブロック")
    assert(redAlly.tempBpBuff === 0, "白以外のスピリットは付与効果を受けない")
}
