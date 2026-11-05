// smoke パート776（未テストのブレイヴ効果：BS13-051／BS15-056／BS15-059／BS16-055／BS16-056／BS16-057／BS16-058／BS16-059）
import { act, assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const ZUGA = "BS13-051" // ズガネーク（紫・ブレイヴ・コスト4・妖蛇）召喚時：自分のスピリット1体を破壊することで、相手は相手のスピリット1体を破壊する
const ANOL = "BS15-056" // ナイト・アノール（紫・ブレイヴ・コスト4・魔影）召喚時：相手のスピリットのコア1個を相手のリザーブに
const HAM = "BS15-059" // スターハム（黄・ブレイヴ・コスト4・小玩）合体時バトル時：BPを比べ破壊されたとき、ボイドからコア1個を自分のライフに
const ARMS = "BS16-055" // アームストロンガー（赤・ブレイヴ・コスト4・翼竜/機竜）合体時アタック時：バースト効果を持たない赤のスピリットカード1枚を手札に戻し、相手のネクサス1つを破壊
const SHIGE = "BS16-056" // シフゲイター（紫・ブレイヴ・コスト7・無魔）召喚時：相手のスピリットすべてのコア1個ずつをリザーブに／合体時合体アタック時：コア2個以下の相手のスピリット1体を破壊
const KOTETSU = "BS16-057" // コテツ・ティーガー（緑・ブレイヴ・コスト5・剣獣/機獣）合体時バトル時：BPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個を相手のリザーブに
const SATELL = "BS16-058" // サテライド・バード（白・ブレイヴ・コスト5・機獣）合体時【重装甲：赤/緑/白】
const KAIMEI = "BS16-059" // カイメイジュー（黄・ブレイヴ・コスト5・戯狩）合体時合体アタック時：相手のスピリット1体を指定し、このバトルの間ブロックできない

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・Lv1 BP3000・効果なし）コスト4以上の合体条件のホスト
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・Lv1 BP3000・効果なし）コスト5以上の合体条件のホスト
const PAROMIDES = "BS17-015" // 闇騎士パロミデス（紫・コスト4・雄将/魔影・Lv1 BP3000）覇皇/雄将の合体条件のホスト
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・Lv1 BP6000/Lv2 BP8000・効果なし）ブロッカー
const BURSTRED = "BS14-010" // キンタローグ・ベアー（赤・バースト効果を持つスピリット）
const SKULL = "BS06-020" // スカルゴイル（紫・効果なしのスピリット）
const SPEARS = "BS01-104" // 千本槍の古戦場（ネクサス）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ZUGA).name === "ズガネーク" && getCard(ZUGA).type === "brave" && getCard(ZUGA).cost === 4 && getCard(ZUGA).family.includes("妖蛇"), "ZUGAはズガネーク（ブレイヴ・紫・コスト4・妖蛇）")
    assert(getCard(ANOL).name === "ナイト・アノール" && getCard(ANOL).type === "brave" && getCard(ANOL).cost === 4 && getCard(ANOL).family.includes("魔影"), "ANOLはナイト・アノール（ブレイヴ・紫・コスト4・魔影）")
    assert(getCard(HAM).name === "スターハム" && getCard(HAM).type === "brave" && getCard(HAM).cost === 4 && getCard(HAM).family.includes("小玩"), "HAMはスターハム（ブレイヴ・黄・コスト4・小玩）")
    assert(getCard(ARMS).name === "アームストロンガー" && getCard(ARMS).type === "brave" && getCard(ARMS).cost === 4 && getCard(ARMS).family.includes("機竜"), "ARMSはアームストロンガー（ブレイヴ・赤・コスト4・翼竜/機竜）")
    assert(getCard(SHIGE).name === "シフゲイター" && getCard(SHIGE).type === "brave" && getCard(SHIGE).cost === 7 && getCard(SHIGE).family.includes("無魔"), "SHIGEはシフゲイター（ブレイヴ・紫・コスト7・無魔）")
    assert(getCard(KOTETSU).name === "コテツ・ティーガー" && getCard(KOTETSU).type === "brave" && getCard(KOTETSU).cost === 5 && getCard(KOTETSU).family.includes("剣獣"), "KOTETSUはコテツ・ティーガー（ブレイヴ・緑・コスト5・剣獣/機獣）")
    assert(getCard(SATELL).name === "サテライド・バード" && getCard(SATELL).type === "brave" && getCard(SATELL).cost === 5 && getCard(SATELL).family.includes("機獣"), "SATELLはサテライド・バード（ブレイヴ・白・コスト5・機獣）")
    assert(getCard(KAIMEI).name === "カイメイジュー" && getCard(KAIMEI).type === "brave" && getCard(KAIMEI).cost === 5 && getCard(KAIMEI).family.includes("戯狩"), "KAIMEIはカイメイジュー（ブレイヴ・黄・コスト5・戯狩）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1 && getCard(VANILLA).effect === "", "VANILLAはロクケラトプス（コスト1・効果なし）")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).cost === 4 && getCard(BELL).effect === "", "BELLはデュアルキャノン・ベル（白・コスト4・効果なし）")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).cost === 5 && getCard(STIRA).effect === "", "STIRAはスティラホーン（赤・コスト5・効果なし）")
    assert(getCard(PAROMIDES).name === "闇騎士パロミデス" && getCard(PAROMIDES).cost === 4 && getCard(PAROMIDES).family.includes("雄将"), "PAROMIDESは闇騎士パロミデス（紫・コスト4・雄将）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).cost === 6 && getCard(TARAN).effect === "" && getCard(TARAN).levels[1]!.bp === 8000, "TARANはタランドーズ（緑・コスト6・効果なし・Lv2 BP8000）")
    assert(getCard(BURSTRED).name === "皇牙獣キンタローグ・ベアー" && getCard(BURSTRED).effect.includes("バースト"), "BURSTREDはバースト効果を持つ赤スピリット")
    assert(getCard(SKULL).name === "スカルゴイル" && getCard(SKULL).colors[0] === "purple" && getCard(SKULL).effect === "", "SKULLはスカルゴイル（紫・効果なし）")
    assert(getCard(SPEARS).name === "千本槍の古戦場" && getCard(SPEARS).type === "nexus", "SPEARSは千本槍の古戦場（ネクサス）")
}

function game(seed: string, interactive = false, phase: "main" | "attack" = "main"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = phase
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// ブレイヴをホストに合体させた盤面を作る（合体条件を満たすホストを選ぶこと）
function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): ReturnType<typeof createInstance> {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

function answer(s: GameState, pick: (options: string[]) => string | undefined, target?: (c: string[]) => string | undefined): string[] {
    const prompts: string[] = []
    for (let i = 0; i < 10 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        prompts.push(pc.prompt)
        const res: Record<string, unknown> = { type: "resolveChoice" }
        if (pc.kind === "option") res["option"] = pick(pc.options ?? []) ?? pc.options![0]
        else if (pc.kind === "target") res["instanceId"] = target?.(pc.candidates ?? []) ?? pc.candidates![0]
        else res["cardIndex"] = pc.cardIndices?.[0]
        if (handleAction(s, pc.pid as PlayerId, res as never) !== null) break
    }
    return prompts
}

console.log("=== 1. ズガネーク召喚時：自分のスピリット1体を破壊することで、相手は相手のスピリット1体を破壊する ===")
{
    const s = game("zuga-both", true)
    const mine = put(s, "p1", VANILLA, 1)
    const theirs = put(s, "p2", VANILLA, 1)
    s.players.p1.hand = [ZUGA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ズガネークを召喚できる")
    answer(
        s,
        (o) => o.find((x) => x.includes("破壊")) ?? o[0],
        (c) => (c.includes(mine.instanceId) ? mine.instanceId : c.includes(theirs.instanceId) ? theirs.instanceId : c[0]),
    )
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === mine.instanceId), "自分のロクケラトプスが破壊される（コストの支払い）")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === theirs.instanceId), "相手は相手のスピリット1体を破壊する")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === ZUGA), "ズガネークはスピリット状態で場に残る")
}

console.log("=== 2. ズガネーク召喚時の境目：相手にスピリットがいなければ後半が解決できないので、コストの自分のスピリット破壊も起きない ===")
{
    const s = game("zuga-no-opp", true)
    const mine = put(s, "p1", VANILLA, 1)
    s.players.p1.hand = [ZUGA]
    act(s, "p1", { type: "summon", handIndex: 0 })
    answer(
        s,
        (o) => o.find((x) => x.includes("破壊")) ?? o[0],
        (c) => c.find((x) => x === mine.instanceId) ?? c[0],
    )
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === mine.instanceId), "後半が解決できないので自分のスピリットは破壊されない")
    assert(s.players.p2.field.spirits.length === 0, "相手の場は空のまま")
}

console.log("=== 3. ナイト・アノール召喚時：相手のスピリットのコア1個を相手のリザーブに置く ===")
{
    const s = game("anol-core", true)
    const theirs = put(s, "p2", SKULL, 3)
    s.players.p1.hand = [ANOL]
    const reserveBefore = s.players.p2.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ナイト・アノールを召喚できる")
    answer(s, (o) => o[0], (c) => c.find((x) => x === theirs.instanceId) ?? c[0])
    assert(theirs.cores === 2, `コア3個のスピリットはコア1個減る（cores=${theirs.cores}）`)
    assert(s.players.p2.reserve === reserveBefore + 1, "減ったコア1個は相手のリザーブに置かれる")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === theirs.instanceId), "コアが残るのでスピリットは場に残る")
}

console.log("=== 4. ナイト・アノール召喚時の境目：コア1個のスピリットはコアが尽きて破壊される ===")
{
    const s = game("anol-destroy", true)
    const theirs = put(s, "p2", VANILLA, 1)
    s.players.p1.hand = [ANOL]
    const reserveBefore = s.players.p2.reserve
    act(s, "p1", { type: "summon", handIndex: 0 })
    answer(s, (o) => o[0], (c) => c.find((x) => x === theirs.instanceId) ?? c[0])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === theirs.instanceId), "コア1個のスピリットは場を離れる")
    assert(s.players.p2.reserve === reserveBefore + 1, "コア1個は相手のリザーブに置かれる")
}

console.log("=== 5. スターハム合体時バトル時：BPを比べ相手のスピリットに破壊されたとき、ボイドからコア1個を自分のライフに置く ===")
{
    const s = game("ham-lose", false, "attack")
    const host = put(s, "p1", BELL, 1)
    combine(s, "p1", host, HAM)
    put(s, "p2", TARAN, 1) // Lv1 BP6000 ＞ 合体スピリット BP5000
    const lifeBefore = s.players.p1.life
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: s.players.p2.field.spirits[0]!.instanceId }) === null, "タランドーズでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：攻撃側パス")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "BPを比べて合体スピリットは破壊される")
    assert(s.players.p1.life === lifeBefore + 1, `ボイドからコア1個を自分のライフに置く（life=${s.players.p1.life}）`)
}

console.log("=== 6. スターハムの境目：BPを比べて勝てば破壊されないので、ライフは増えない ===")
{
    const s = game("ham-win", false, "attack")
    const host = put(s, "p1", BELL, 1)
    combine(s, "p1", host, HAM)
    const blocker = put(s, "p2", VANILLA, 1) // BP1000 ＜ BP5000
    const lifeBefore = s.players.p1.life
    act(s, "p1", { type: "attack", instanceId: host.instanceId })
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    act(s, "p2", { type: "block", instanceId: blocker.instanceId })
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "合体スピリットは破壊されない")
    assert(s.players.p1.life === lifeBefore, "破壊されていないのでライフは増えない")
}

console.log("=== 7. アームストロンガー合体時アタック時：バースト効果を持たない赤のスピリットカード1枚を手札に戻し、相手のネクサス1つを破壊する ===")
{
    const s = game("arms-both", true, "attack")
    const host = put(s, "p1", STIRA, 1)
    combine(s, "p1", host, ARMS)
    // 先頭にバースト持ちの赤と赤以外を置く。絞り込みが正しければ、戻るのは末尾のロクケラトプスだけ
    s.players.p1.trashCards.push(BURSTRED, SKULL, VANILLA) // 赤バーストあり／赤以外／赤バーストなし
    s.players.p2.field.nexuses.push(createInstance(SPEARS, s.turn, 0))
    const handBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    // 同時発揮の解決順（アタック時効果と千本槍の古戦場）が出るので、アームストロンガー側を先に解決する
    answer(s, (o) => o.find((x) => x.includes("スティラホーン")) ?? o[0])
    assert(s.players.p1.hand.length === handBefore + 1 && s.players.p1.hand.includes(VANILLA), "バースト効果を持たない赤のロクケラトプスが手札に戻る")
    assert(!s.players.p1.trashCards.includes(VANILLA), "戻したカードはトラッシュから消える")
    assert(s.players.p1.trashCards.includes(BURSTRED) && s.players.p1.trashCards.includes(SKULL), "バースト効果を持つ赤と赤以外はトラッシュに残る")
    assert(!s.players.p1.hand.includes(BURSTRED) && !s.players.p1.hand.includes(SKULL), "バースト効果を持つ赤と赤以外は手札に戻らない")
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサス1つを破壊する")
}

console.log("=== 8. アームストロンガーの境目：戻せるカードがなければネクサスだけ破壊する ===")
{
    const s = game("arms-no-card", true, "attack")
    const host = put(s, "p1", STIRA, 1)
    combine(s, "p1", host, ARMS)
    s.players.p1.trashCards.push(BURSTRED, SKULL) // 赤はバースト持ちのみ・あとは赤以外
    s.players.p2.field.nexuses.push(createInstance(SPEARS, s.turn, 0))
    const handBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    const prompts = answer(s, (o) => o[0], (c) => c[0])
    assert(!prompts.some((p) => p.includes("トラッシュ") || p.includes("カード")), `戻せるカードがないのでカード選択は出ない（${prompts.join("/")}）`)
    assert(s.players.p1.hand.length === handBefore, "手札は増えない")
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサスは破壊される")
}

console.log("=== 9. シフゲイター召喚時：相手のスピリットすべてのコア1個ずつを相手のリザーブに置く ===")
{
    const s = game("shige-summon", false)
    const a = put(s, "p2", SKULL, 2)
    const b = put(s, "p2", VANILLA, 1)
    s.players.p1.hand = [SHIGE]
    const reserveBefore = s.players.p2.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "シフゲイターを召喚できる")
    assert(a.cores === 1, `コア2個のスピリットはコア1個減る（cores=${a.cores}）`)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === b.instanceId), "コア1個のスピリットはコアが尽きて場を離れる")
    assert(s.players.p2.reserve === reserveBefore + 2, "すべてのスピリットからコア1個ずつ相手のリザーブに置かれる")
}

console.log("=== 10. シフゲイター合体時合体アタック時：コアが2個以下の相手のスピリット1体を破壊する（3個は対象外） ===")
{
    const s = game("shige-combined", true, "attack")
    const host = put(s, "p1", PAROMIDES, 1) // 雄将なので合体条件を満たす
    combine(s, "p1", host, SHIGE)
    const twoA = put(s, "p2", SKULL, 2)
    const twoB = put(s, "p2", SKULL, 2)
    const three = put(s, "p2", TARAN, 3) // Lv2 BP8000・コア3個
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    let candidates: string[] = []
    answer(
        s,
        (o) => o[0],
        (c) => {
            candidates = c
            return c.find((x) => x === twoA.instanceId) ?? c[0]
        },
    )
    assert(candidates.includes(twoA.instanceId) && candidates.includes(twoB.instanceId) && !candidates.includes(three.instanceId), `候補はコア2個以下の2体だけ（${candidates.join("/")}）`)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === twoA.instanceId), "選んだコア2個のスピリットが破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === twoB.instanceId), "選んでいないコア2個のスピリットは場に残る")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === three.instanceId), "コア3個のスピリットは対象外で場に残る")
}

console.log("=== 11. コテツ・ティーガー合体時バトル時：BPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個を相手のリザーブに置く ===")
{
    const s = game("kotetsu-win", false, "attack")
    const host = put(s, "p1", STIRA, 1)
    combine(s, "p1", host, KOTETSU) // BP3000+5000=8000
    const blocker = put(s, "p2", VANILLA, 1) // BP1000
    const lifeBefore = s.players.p2.life
    const reserveBefore = s.players.p2.reserve
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ロクケラトプスでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：攻撃側パス")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "相手のスピリットだけが破壊される")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "合体スピリットは場に残る")
    assert(s.players.p2.life === lifeBefore - 1, `相手のライフのコア1個が減る（life=${s.players.p2.life}）`)
    assert(s.players.p2.reserve === reserveBefore + 2, "ライフのコア1個と破壊されたブロッカーのコア1個が相手のリザーブに置かれる")
}

console.log("=== 12. コテツ・ティーガーの境目：BPが同じなら相討ち、「相手だけ」ではないのでライフは減らない ===")
{
    const s = game("kotetsu-tie", false, "attack")
    const host = put(s, "p1", STIRA, 1)
    combine(s, "p1", host, KOTETSU) // BP8000
    const blocker = put(s, "p2", TARAN, 3) // Lv2 BP8000
    const lifeBefore = s.players.p2.life
    act(s, "p1", { type: "attack", instanceId: host.instanceId })
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "BP8000でブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：攻撃側パス")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "BPが同じなので合体スピリットも破壊される")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "ブロッカーも破壊される")
    assert(s.players.p2.life === lifeBefore, "相手のスピリット「だけ」でないのでライフは減らない")
}

console.log("=== 13. カイメイジュー合体時合体アタック時：指定した相手のスピリットはこのバトルの間ブロックできない ===")
{
    const s = game("kaimei-block", true, "attack")
    const host = put(s, "p1", STIRA, 1)
    combine(s, "p1", host, KAIMEI)
    const a = put(s, "p2", VANILLA, 1)
    const b = put(s, "p2", SKULL, 1)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    answer(
        s,
        (o) => o[0],
        (c) => {
            assert(c.includes(a.instanceId) && c.includes(b.instanceId), "指定する相手のスピリット1体を選ぶ")
            return a.instanceId
        },
    )
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: a.instanceId }) !== null, "指定されたロクケラトプスはブロックできない")
    assert(act(s, "p2", { type: "block", instanceId: b.instanceId }) === null, "指定していないスカルゴイルはブロックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：攻撃側パス")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === a.instanceId && !x.isRested), "ブロックできなかったロクケラトプスは疲労しない")
}

console.log("=== 14. サテライド・バード合体時【重装甲：赤/緑/白】：合体中のホストは赤/緑/白の効果を受けない ===")
{
    const s = game("satell-armor", false)
    const host = put(s, "p1", STIRA, 1)
    combine(s, "p1", host, SATELL)
    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, host.instanceId, ["red"], "spirit")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "赤の破壊効果は受けない")
    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, host.instanceId, ["green"], "spirit")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "緑の破壊効果は受けない")
    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, host.instanceId, ["white"], "spirit")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "白の破壊効果は受けない")
    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, host.instanceId, ["purple"], "spirit")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "紫の破壊効果は受ける")
}

console.log("=== 15. サテライド・バードの境目：スピリット状態（合体していない）では重装甲は付かない ===")
{
    const s = game("satell-solo", false)
    const solo = put(s, "p1", SATELL, 1)
    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, solo.instanceId, ["red"], "spirit")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === solo.instanceId), "スピリット状態では赤の破壊効果を受ける")
}

console.log("すべてのチェックに合格しました 🎉（part776）")
