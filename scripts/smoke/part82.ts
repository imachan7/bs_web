// smoke パート82（カード名参照の3枚 ＝ BS04 の未実装カード）
//
//   - BS04-037 鎧装獣ヘイズ・ルーン: constraint "cantAttack" の条件つき（unlessOpponentHasColorSpirit）と
//     fieldEvent "anySpiritAttacked" の costFilter / selfMode:"source"
//   - BS04-042 獣使いドヴェルグ: kind "constraintSuppression"（カード名「鎧装獣」の cantAttack を発揮させない）と
//     battleWon の winnerNameContains ＋ TargetFilter.sameColorAsBattleLoser
//   - BS04-090 ニーベルングリング: 貸与（lendSelfThisTurn）した battleWon（lentOnly）と
//     TargetFilter.sameFamilyAsBattleLoser
import {
    act,
    assert,
    createGame,
    createInstance,
} from "./helpers"
import { activeConstraints } from "../../shared/rules"
import type { GameState, PlayerId } from "./helpers"
import { endTurn } from "../../server/src/logic/PhaseManager"

function setup(seed: string, p1Color: string, p2Color: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: p1Color, p2: p2Color })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function hasCantAttack(s: GameState, pid: PlayerId, inst: ReturnType<typeof createInstance>): boolean {
    return activeConstraints(s, pid, inst).some((c) => c.type === "cantAttack")
}

console.log("=== BS04-037 鎧装獣ヘイズ・ルーン：相手に赤のスピリットがいない間はアタックできない ===")
{
    const s = setup("hazerune-cantattack-test", "white", "red")
    const haze = put(s, "p1", "BS04-037", 1) // 鎧装獣ヘイズ・ルーン Lv1

    assert(hasCantAttack(s, "p1", haze), "相手に赤のスピリットがいなければアタックできない")

    const red = put(s, "p2", "BS01-001", 1) // ゴラドン（赤）
    assert(!hasCantAttack(s, "p1", haze), "相手に赤のスピリットがいればアタック制約は外れる")

    s.players.p2.field.spirits = s.players.p2.field.spirits.filter((x) => x !== red)
    put(s, "p2", "BS01-031", 1) // デス・ハーデス（紫）だけになる
    assert(hasCantAttack(s, "p1", haze), "赤以外のスピリットでは制約は外れない")
}

console.log("--- 相手のコスト1以下のスピリットがアタックしたとき、ヘイズ・ルーン自身が回復する ---")
{
    const s = setup("hazerune-refresh-test", "white", "red")
    const haze = put(s, "p1", "BS04-037", 1)
    haze.isRested = true
    put(s, "p2", "BS01-001", 1) // ゴラドン（コスト0）
    endTurn(s) // p1 → p2
    assert(s.turnPlayer === "p2", "p2のターンになる")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ移行")
    const attacker = s.players.p2.field.spirits[0]!
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "ゴラドンでアタック")
    assert(!haze.isRested, "コスト1以下のアタックでヘイズ・ルーンが回復する")
}

console.log("--- コスト2以上の相手がアタックしても回復しない ---")
{
    const s = setup("hazerune-costfilter-test", "white", "red")
    const haze = put(s, "p1", "BS04-037", 1)
    haze.isRested = true
    put(s, "p2", "BS01-020", 1) // 翼刃竜スティラノドン（コスト6）
    endTurn(s)
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ移行")
    const attacker = s.players.p2.field.spirits[0]!
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "コスト6のスピリットでアタック")
    assert(haze.isRested, "コスト2以上のアタックでは回復しない")
}

console.log("=== BS04-042 獣使いドヴェルグ：「鎧装獣」の「アタックできない」を発揮させない ===")
{
    const s = setup("dvergr-suppress-test", "white", "red")
    const haze = put(s, "p1", "BS04-037", 1) // 相手に赤がいないのでアタック不可の状態
    s.phase = "attack"
    assert(hasCantAttack(s, "p1", haze), "ドヴェルグがいなければアタックできないまま")

    put(s, "p1", "BS04-042", 1) // 獣使いドヴェルグ Lv1
    assert(!hasCantAttack(s, "p1", haze), "ドヴェルグがいると「鎧装獣」のアタック制約は発揮されない")

    // 『自分のアタックステップ』限定：メインステップでは抑止されない
    s.phase = "main"
    assert(hasCantAttack(s, "p1", haze), "メインステップでは抑止されない（phase指定）")

    // 相手ターンでも抑止されない（turn:"own"）
    s.phase = "attack"
    s.turnPlayer = "p2"
    assert(hasCantAttack(s, "p1", haze), "相手のアタックステップでは抑止されない（turn指定）")
}

console.log("--- 「鎧装獣」以外のスピリットの制約は抑止されない ---")
{
    const s = setup("dvergr-namefilter-test", "white", "red")
    put(s, "p1", "BS04-042", 1)
    s.phase = "attack"
    // BS04-036 オッドセイ（カード名に「鎧装獣」を含まない cantAttack 持ち）で確認する
    const oddsey = put(s, "p1", "BS04-036", 1)
    assert(hasCantAttack(s, "p1", oddsey), "名前が一致しないスピリットの cantAttack は残る")
}

console.log("--- 「鎧装獣」がバトルで相手だけを破壊したとき、同じ色のスピリット1体を疲労させる ---")
{
    const s = setup("dvergr-battlewon-test", "white", "green")
    put(s, "p1", "BS04-042", 2) // ドヴェルグ Lv2
    const haze = put(s, "p1", "BS04-037", 4) // ヘイズ・ルーン Lv2（BP6000）
    const blocker = put(s, "p2", "BS01-050", 1) // ビートビートル（緑・BP1000）
    const sameColor = put(s, "p2", "BS01-051", 1) // フライングミラージュ（緑）＝同色
    put(s, "p2", "BS01-001", 1) // ゴラドン（赤）＝別色。ヘイズ・ルーンのアタック制約もこれで外れる

    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: haze.instanceId }) === null, "ヘイズ・ルーンでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ビートビートルでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "p2パス")
    assert(act(s, "p1", { type: "pass" }) === null, "p1パス → バトル解決")

    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId),
        "ブロッカーは破壊される",
    )
    assert(sameColor.isRested, "破壊されたスピリットと同じ色（緑）のスピリットが疲労する")
    const otherColor = s.players.p2.field.spirits.find((x) => x.cardId === "BS01-001")
    assert(otherColor !== undefined && !otherColor.isRested, "別の色のスピリットは疲労しない")
}

console.log("=== BS04-090 ニーベルングリング：「ジーク」が相手だけを破壊したとき同系統をすべて破壊する ===")
{
    const s = setup("nibelung-test", "red", "green")
    const zieg = put(s, "p1", "BS01-X01", 5) // 龍皇ジークフリード Lv3（BP10000）
    const blocker = put(s, "p2", "BS01-050", 1) // ビートビートル（系統:殻虫・BP1000）
    const sameFamily = put(s, "p2", "BS03-025", 1) // スタッグシザー（系統:殻虫）
    const otherFamily = put(s, "p2", "BS01-054", 1) // ショックイーター（系統:樹魔）

    s.players.p1.hand[0] = "BS04-090" // ニーベルングリング（フラッシュ・コスト3）
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: zieg.instanceId }) === null, "ジークフリードでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ビートビートルでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "p2パス（攻撃側へ優先権が移る）")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ニーベルングリングをフラッシュで使用")
    assert(act(s, "p2", { type: "pass" }) === null, "p2パス")
    assert(act(s, "p1", { type: "pass" }) === null, "p1パス → バトル解決")

    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId),
        "ブロッカーは破壊される",
    )
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === sameFamily.instanceId),
        "破壊されたスピリットと同じ系統（殻虫）のスピリットもすべて破壊される",
    )
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === otherFamily.instanceId),
        "別の系統のスピリットは破壊されない",
    )
}

console.log("--- ニーベルングリングを使っていないターンは追撃しない（貸与＝lentOnly） ---")
{
    const s = setup("nibelung-notlent-test", "red", "green")
    const zieg = put(s, "p1", "BS01-X01", 5)
    const blocker = put(s, "p2", "BS01-050", 1)
    const sameFamily = put(s, "p2", "BS03-025", 1)

    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: zieg.instanceId }) === null, "ジークフリードでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ビートビートルでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "p2パス")
    assert(act(s, "p1", { type: "pass" }) === null, "p1パス → バトル解決")

    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === sameFamily.instanceId),
        "貸与していないターンは同系統の追撃が起きない",
    )
}
