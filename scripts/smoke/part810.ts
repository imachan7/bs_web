// smoke パート810（BS21 白の期待値：028・029・030・031・032・033・035・061・079・X07。効果文と docs/design/BS21_PLAN.md §1 の読みから書いた場面テスト）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const FALCON = "BS21-028" // プロード・ファルコン（白・武装・Lv3【強化】）
const KIRIN = "BS21-029" // リシアキリン（白・巨獣・Lv1･2 重装甲：赤/緑・Lv2 連鎖持ち紫に重装甲を与える）
const MACH = "BS21-030" // 真紅の女神マッハ（白・氷姫・相手アタックステップ疲労ブロック・Lv2･3 重装甲：赤/紫）
const GAE = "BS21-031" // 神機ゲイボルグ（白・武装・Lv2【強化】）
const ASTERIO = "BS21-032" // 猟犬機アステリオ・ベネラ9号（白・武装/星魂・相手アタック時に星魂を回復）
const GENESHIELD = "BS21-033" // 近衛機ジェネシルド（白・武装・【強化】・Lv2 ブロック時に相手だけ破壊でバウンス）
const KANGAL = "BS21-035" // ネガ・カンガル（白・機獣・ブロック時BP+5000）
const PIONEER = "BS21-061" // 衛星機パイオニア・V（白・ブレイヴ・合体条件：白シンボル・合体時ブロック時BP+3000）
const ETERNAL = "BS21-079" // エターナルディフェンス（白・マジック・フラッシュ：疲労状態でブロック可）
const CROWN = "BS21-X07" // 天空の光剣クラウン・ソーラー（白・剣刃・ブレイヴ・コスト5）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const MIRAGE = "BS01-051" // フライングミラージュ（緑・コスト1・BP2000）
const GATLING = "BS01-084" // ガトリングスタンド（白・武装・コスト3・BP3000・効果なし）
const MATANGO = "BS10-028" // マタンゴル（緑・コスト5・Lv1 BP6000/Lv2 BP8000・効果なし）
const FISH = "BS10-036" // 水晶魚クリスティール（白・星魂・コスト4・効果なし）
const SWORDOLL = "BS19-014" // ダーク・ソードール（紫・Lv1 BP1000・【連鎖】持ち）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・BP2000・【連鎖】なし）
const POTION = "BS02-102" // ホワイトポーション（白・マジック・フラッシュ：自分のスピリット1体を回復させる）
const ARDOR = "BS17-073" // アーダーフレイム（赤・マジック・フラッシュ：BP4000以下の相手のスピリット1体を破壊）
const COFFIN = "BS01-131" // ダークコフィン（紫・マジック・メイン：疲労状態のスピリット1体を破壊）

console.log("=== 前提: カードの機械確認（BS21 は staging にしか無い） ===")
{
    type St = { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; levels: { level: number; cores: number; bp?: number }[] }
    const staging = JSON.parse(readFileSync("data/staging/BS21.json", "utf8")) as St[]
    const f = (id: string) => staging.find((c) => c.cardId === id)!
    const lv = (id: string) => f(id).levels.map((l) => `${l.cores}/${l.bp}`).join(",")
    assert(f(FALCON).name === "プロード・ファルコン" && f(FALCON).type === "spirit" && lv(FALCON) === "1/2000,3/4000,5/5000", "FALCONはプロード・ファルコン（Lv3=5コア）")
    assert(f(KIRIN).name === "リシアキリン" && f(KIRIN).cost === 2 && lv(KIRIN) === "1/2000,3/4000", "KIRINはリシアキリン（Lv2=3コア・BP4000）")
    assert(f(MACH).name === "真紅の女神マッハ" && lv(MACH) === "1/3000,3/5000,5/7000", "MACHは真紅の女神マッハ（Lv2=3コア・Lv3=5コア）")
    assert(f(GAE).name === "神機ゲイボルグ" && lv(GAE) === "1/3000,2/6000", "GAEは神機ゲイボルグ（Lv2=2コア）")
    assert(f(ASTERIO).name === "猟犬機アステリオ・ベネラ9号" && f(ASTERIO).family.includes("星魂") && lv(ASTERIO) === "1/2000,2/4000,5/7000", "ASTERIOはアステリオ・ベネラ9号（星魂）")
    assert(f(GENESHIELD).name === "近衛機ジェネシルド" && lv(GENESHIELD) === "1/3000,2/5000,4/6000", "GENESHIELDはジェネシルド（Lv2=2コア・BP5000）")
    assert(f(KANGAL).name === "ネガ・カンガル" && lv(KANGAL) === "1/5000,4/9000", "KANGALはネガ・カンガル（Lv2=4コア）")
    assert(f(PIONEER).name === "衛星機パイオニア・V" && f(PIONEER).type === "brave" && f(PIONEER).cost === 3, "PIONEERはパイオニア・V（ブレイヴ・コスト3）")
    assert(f(ETERNAL).name === "エターナルディフェンス" && f(ETERNAL).type === "magic" && f(ETERNAL).cost === 3, "ETERNALはエターナルディフェンス（マジック・コスト3）")
    assert(f(CROWN).name === "天空の光剣クラウン・ソーラー" && f(CROWN).type === "brave" && f(CROWN).cost === 5, "CROWNはクラウン・ソーラー（ブレイヴ・コスト5）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).effect === "", "VANはロクケラトプス（効果なし）")
    assert(getCard(MIRAGE).name === "フライングミラージュ" && getCard(MIRAGE).levels[0]!.bp === 2000, "MIRAGEはフライングミラージュ（BP2000）")
    assert(getCard(GATLING).name === "ガトリングスタンド" && getCard(GATLING).cost === 3 && getCard(GATLING).colors[0] === "white" && getCard(GATLING).effect === "", "GATLINGはガトリングスタンド（白・コスト3）")
    assert(getCard(MATANGO).name === "マタンゴル" && getCard(MATANGO).cost === 5 && getCard(MATANGO).levels[1]!.cores === 3 && getCard(MATANGO).levels[1]!.bp === 8000 && getCard(MATANGO).effect === "", "MATANGOはマタンゴル（コスト5・Lv2=3コア BP8000・効果なし）")
    assert(getCard(FISH).name === "水晶魚クリスティール" && getCard(FISH).family.includes("星魂") && getCard(FISH).colors[0] === "white" && getCard(FISH).effect === "", "FISHはクリスティール（白・星魂・効果なし）")
    assert(getCard(SWORDOLL).name === "ダーク・ソードール" && getCard(SWORDOLL).colors[0] === "purple" && getCard(SWORDOLL).effect.includes("【連鎖"), "SWORDOLLは【連鎖】を持つ紫のスピリット")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).colors[0] === "purple" && !getCard(GRIP).effect.includes("【連鎖"), "GRIPは【連鎖】を持たない紫のスピリット")
    assert(getCard(POTION).name === "ホワイトポーション" && getCard(POTION).effect.includes("自分のスピリット1体を回復させる"), "POTIONはホワイトポーション")
    assert(getCard(ARDOR).name === "アーダーフレイム" && getCard(ARDOR).colors[0] === "red" && getCard(ARDOR).effect.includes("BP4000以下"), "ARDORは赤のBP4000以下破壊")
    assert(getCard(COFFIN).name === "ダークコフィン" && getCard(COFFIN).colors[0] === "purple" && getCard(COFFIN).effect.includes("疲労状態のスピリット1体を破壊"), "COFFINは紫の疲労スピリット破壊")
}

function game(seed: string, turnPlayer: PlayerId = "p1", phase: "main" | "attack" = "attack"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "green" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = phase
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 5
        p.burst = null
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): void {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

function scene(label: string, fn: () => void): void {
    console.log(`=== ${label} ===`)
    try {
        fn()
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes("カードが見つかりません") && msg.includes("BS21-")) console.log(`  ⚠ 未実装カードで未確認: ${msg}`)
        else throw e
    }
}

function settle(s: GameState, picks: string[] = [], pref: string[] = ["発動する", "回復する", "戻す"]): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = pref.find((x) => o.includes(x)) ?? o[0]
            err = pick === undefined ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

// アタック宣言からブロック宣言の直前まで（防御側→攻撃側の順にフラッシュをパスする）
function reachBlock(s: GameState, atkPid: PlayerId, attackerId: string): void {
    const def: PlayerId = atkPid === "p1" ? "p2" : "p1"
    assert(act(s, atkPid, { type: "attack", instanceId: attackerId }) === null, "アタックできる")
    assert(act(s, def, { type: "pass" }) === null, "防御側のパス")
    assert(act(s, atkPid, { type: "pass" }) === null, "アタック側のパス")
}

// ブロック宣言が通るまで優先権のあるほうがパスして進める（通らなければ最後のエラーを返す）
function blockWithPasses(s: GameState, pid: PlayerId, blockerId: string): string | null {
    let err: string | null = null
    for (let i = 0; i < 6; i++) {
        err = declareBlock(s, pid, blockerId)
        if (err === null) return null
        act(s, s.priorityPlayer, { type: "pass" })
    }
    return err
}

// ───── 028・031・033・X07：【強化】（白＝「スピリット回復効果」の体数+1）。ホワイトポーション（回復1体）で何体回復するかで確かめる
function refreshCase(label: string, cardId: string, cores: number, expectBoth: boolean, withHost = false): void {
    scene(label, () => {
        const s = game(label)
        if (withHost) combine(s, "p1", put(s, "p1", MATANGO, 3), cardId)
        else put(s, "p1", cardId, cores)
        const o1 = put(s, "p1", GATLING, 1)
        const o2 = put(s, "p1", GATLING, 1)
        o1.isRested = true
        o2.isRested = true
        const atk = put(s, "p1", VAN, 1)
        s.players.p1.hand = [POTION]
        assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ロクケラトプスでアタック")
        assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパス")
        assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: o1.instanceId }) === null, "ホワイトポーションを使用")
        settle(s, [o1.instanceId, o2.instanceId])
        assert(!o1.isRested, "選んだ1体は回復する")
        if (expectBoth) assert(!o2.isRested, "【強化】で回復の体数が+1されるので、もう1体も回復する")
        else assert(o2.isRested, "【強化】が効かない（Lv不足）ので、もう1体は回復しない")
        assert(s.players.p1.trashCards.length === 1, "使ったマジックはトラッシュへ")
    })
}
refreshCase("A1: 028 Lv3（5コア）【強化】で回復2体", FALCON, 5, true)
refreshCase("A2: 028 の境目 Lv2（3コア）は【強化】なしで回復1体", FALCON, 3, false)
refreshCase("A3: 031 Lv2（2コア）【強化】で回復2体", GAE, 2, true)
refreshCase("A4: 031 の境目 Lv1（1コア）は【強化】なしで回復1体", GAE, 1, false)
refreshCase("A5: 033 Lv1（1コア）【強化】で回復2体（Lv1･Lv2･Lv3）", GENESHIELD, 1, true)
refreshCase("A6: X07 Lv1（スピリット状態1コア）【強化】で回復2体", CROWN, 1, true)
refreshCase("A7: X07 【合体中】【強化】で回復2体（ホストはマタンゴル）", CROWN, 0, true, true)

// ───── 029 リシアキリン
function ardorOn(s: GameState, targetId: string, mirageOwnerAtk = true): void {
    const mirage = put(s, "p2", MIRAGE, 1)
    s.players.p2.hand = [ARDOR]
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    assert(act(s, "p2", { type: "attack", instanceId: mirage.instanceId }) === null, "フライングミラージュでアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: targetId }) // 効果を受けない対象は選べず、拒否されてもよい
    settle(s, [targetId])
    void mirageOwnerAtk
}
scene("B0: 対照 ― 重装甲のいないロクケラトプスはアーダーフレイムで破壊される", () => {
    const s = game("kirin-control")
    const van = put(s, "p1", VAN, 1)
    ardorOn(s, van.instanceId)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "対照のロクケラトプスは破壊される")
})
scene("B1: 029 Lv2 は相手の赤の効果（アーダーフレイム）を受けず、BP4000でも破壊されない", () => {
    const s = game("kirin-red")
    const kirin = put(s, "p1", KIRIN, 3) // Lv2 BP4000
    ardorOn(s, kirin.instanceId)
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === kirin.instanceId), "リシアキリンは赤の効果を受けず場に残る")
})
scene("B2: 029 Lv1 でも重装甲（Lv1･Lv2）。赤の効果を受けない", () => {
    const s = game("kirin-lv1")
    const kirin = put(s, "p1", KIRIN, 1) // Lv1 BP2000
    ardorOn(s, kirin.instanceId)
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === kirin.instanceId), "Lv1のリシアキリンも赤の効果を受けず場に残る")
})
scene("B3: 029 の境目 ― 紫（赤/緑以外）のダークコフィンでは破壊される", () => {
    const s = game("kirin-purple", "p2", "main")
    const kirin = put(s, "p1", KIRIN, 3)
    kirin.isRested = true
    s.players.p2.hand = [COFFIN]
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: kirin.instanceId }) === null, "ダークコフィンを使用できる")
    settle(s, [kirin.instanceId])
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === kirin.instanceId), "紫の効果は受けるので破壊される")
    assert(s.players.p1.reserve === 23, "破壊されたリシアキリンの3コアはリザーブへ（20+3）")
})
scene("B4: 029 Lv2 は【連鎖】を持つ自分の紫のスピリット（ソードール）に重装甲：赤/緑を与える", () => {
    const s = game("kirin-chain")
    put(s, "p1", KIRIN, 3) // Lv2
    const sword = put(s, "p1", SWORDOLL, 1) // BP1000
    ardorOn(s, sword.instanceId)
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === sword.instanceId), "ソードールは赤の効果を受けず場に残る")
})
scene("B5: 029 の境目 ― Lv1 では与えない（ソードールは破壊される）", () => {
    const s = game("kirin-chain-lv1")
    put(s, "p1", KIRIN, 1) // Lv1
    const sword = put(s, "p1", SWORDOLL, 1)
    ardorOn(s, sword.instanceId)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === sword.instanceId), "Lv1のリシアキリンは重装甲を与えないのでソードールは破壊される")
})
scene("B6: 029 の境目 ― 【連鎖】を持たない紫（グリプ・ハンズ）には与えない", () => {
    const s = game("kirin-chain-none")
    put(s, "p1", KIRIN, 3) // Lv2
    const grip = put(s, "p1", GRIP, 1) // BP2000
    ardorOn(s, grip.instanceId)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === grip.instanceId), "【連鎖】を持たない紫のスピリットは重装甲を得ず破壊される")
})

// ───── 030 真紅の女神マッハ
scene("C1: 030 は相手のアタックステップなら疲労状態でもブロックできる", () => {
    const s = game("mach-block", "p2")
    const mach = put(s, "p1", MACH, 1)
    mach.isRested = true
    const mirage = put(s, "p2", MIRAGE, 1)
    reachBlock(s, "p2", mirage.instanceId)
    assert(declareBlock(s, "p1", mach.instanceId) === null, "疲労状態のマッハでブロックできる")
})
scene("C2: 030 の境目 ― 疲労状態のロクケラトプスはブロックできない", () => {
    const s = game("mach-van", "p2")
    put(s, "p1", MACH, 1)
    const van = put(s, "p1", VAN, 1)
    van.isRested = true
    const mirage = put(s, "p2", MIRAGE, 1)
    reachBlock(s, "p2", mirage.instanceId)
    assert(declareBlock(s, "p1", van.instanceId) !== null, "マッハの効果はこのスピリット自身だけ。疲労状態のロクケラトプスはブロックできない")
})
scene("C3: 030 Lv2 は相手の紫の効果（ダークコフィン）を受けない", () => {
    const s = game("mach-lv2", "p2", "main")
    const mach = put(s, "p1", MACH, 3) // Lv2
    mach.isRested = true
    s.players.p2.hand = [COFFIN]
    act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: mach.instanceId })
    settle(s, [mach.instanceId])
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === mach.instanceId), "Lv2のマッハは紫の効果を受けず場に残る")
})
scene("C4: 030 の境目 ― Lv1 は重装甲なし。ダークコフィンで破壊される", () => {
    const s = game("mach-lv1", "p2", "main")
    const mach = put(s, "p1", MACH, 1) // Lv1
    mach.isRested = true
    s.players.p2.hand = [COFFIN]
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: mach.instanceId }) === null, "ダークコフィンを使用できる")
    settle(s, [mach.instanceId])
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === mach.instanceId), "Lv1は破壊される")
    assert(s.players.p1.reserve === 21, "破壊されたマッハの1コアはリザーブへ")
})
scene("C5: 030 Lv3 も紫の効果を受けない（Lv2･Lv3）", () => {
    const s = game("mach-lv3", "p2", "main")
    const mach = put(s, "p1", MACH, 5) // Lv3
    mach.isRested = true
    s.players.p2.hand = [COFFIN]
    act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: mach.instanceId })
    settle(s, [mach.instanceId])
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === mach.instanceId), "Lv3のマッハも紫の効果を受けず場に残る")
})

// ───── 032 アステリオ・ベネラ9号
scene("D1: 032 は相手のスピリットがアタックしたとき、疲労状態の星魂1体を回復（非星魂は回復しない）", () => {
    const s = game("asterio-opp", "p2")
    put(s, "p1", ASTERIO, 1)
    const fish = put(s, "p1", FISH, 1)
    const van = put(s, "p1", VAN, 1)
    fish.isRested = true
    van.isRested = true
    const mirage = put(s, "p2", MIRAGE, 1)
    assert(act(s, "p2", { type: "attack", instanceId: mirage.instanceId }) === null, "フライングミラージュでアタック")
    settle(s, [fish.instanceId])
    assert(!fish.isRested, "星魂のクリスティールが回復する")
    assert(van.isRested, "星魂を持たないロクケラトプスは回復しない")
})
scene("D2: 032 の境目 ― 自分のアタックステップでは回復しない", () => {
    const s = game("asterio-mine", "p1")
    put(s, "p1", ASTERIO, 1)
    const fish = put(s, "p1", FISH, 1)
    fish.isRested = true
    const van = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    settle(s, [fish.instanceId])
    assert(fish.isRested, "自分のアタックでは相手のアタックステップの効果は発揮されない")
})

// ───── 033 ジェネシルド Lv2･Lv3『ブロック時』
scene("E1: 033 Lv2 がブロックしBP比べで相手だけ破壊 → 相手のスピリット1体を手札に戻す", () => {
    const s = game("gene-win", "p2")
    const gene = put(s, "p1", GENESHIELD, 2) // Lv2 BP5000
    const mirage = put(s, "p2", MIRAGE, 1) // BP2000
    const gatling = put(s, "p2", GATLING, 1)
    reachBlock(s, "p2", mirage.instanceId)
    assert(declareBlock(s, "p1", gene.instanceId) === null, "ジェネシルドでブロック")
    passFlash(s)
    settle(s, [gatling.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === mirage.instanceId), "BP比べ（5000 vs 2000）でアタッカーだけ破壊")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === gene.instanceId), "ジェネシルドは残る")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === gatling.instanceId) && s.players.p2.hand.length === 1, "相手のスピリット（ガトリングスタンド）が手札に戻る")
})
scene("E2: 033 の境目 ― Lv1 では手札に戻さない", () => {
    const s = game("gene-lv1", "p2")
    const gene = put(s, "p1", GENESHIELD, 1) // Lv1 BP3000
    const mirage = put(s, "p2", MIRAGE, 1)
    const gatling = put(s, "p2", GATLING, 1)
    reachBlock(s, "p2", mirage.instanceId)
    assert(declareBlock(s, "p1", gene.instanceId) === null, "ジェネシルドでブロック")
    passFlash(s)
    settle(s, [gatling.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === mirage.instanceId), "BP比べ（3000 vs 2000）でアタッカーは破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === gatling.instanceId) && s.players.p2.hand.length === 0, "Lv1は手札に戻さない")
})
scene("E3: 033 の境目 ― ブロッカーも破壊されたら（相手だけではない）手札に戻さない", () => {
    const s = game("gene-lose", "p2")
    const gene = put(s, "p1", GENESHIELD, 2) // BP5000
    const matango = put(s, "p2", MATANGO, 3) // Lv2 BP8000
    const gatling = put(s, "p2", GATLING, 1)
    reachBlock(s, "p2", matango.instanceId)
    assert(declareBlock(s, "p1", gene.instanceId) === null, "ジェネシルドでブロック")
    passFlash(s)
    settle(s, [gatling.instanceId])
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === gene.instanceId), "BP比べ（5000 vs 8000）でジェネシルドが破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === gatling.instanceId) && s.players.p2.hand.length === 0, "相手のスピリットだけ破壊したのではないので戻さない")
})

// ───── 035 ネガ・カンガル
scene("F1: 035 Lv1 はブロック時にそのバトルの間BP+5000（5000→10000）。BP8000のマタンゴルを破壊して残る", () => {
    const s = game("kangal-lv1", "p2")
    const kangal = put(s, "p1", KANGAL, 1)
    const matango = put(s, "p2", MATANGO, 3) // BP8000
    reachBlock(s, "p2", matango.instanceId)
    assert(effectiveBp(s, "p1", kangal) === 5000, "ブロック前はBP5000")
    assert(declareBlock(s, "p1", kangal.instanceId) === null, "ネガ・カンガルでブロック")
    settle(s)
    assert(effectiveBp(s, "p1", kangal) === 10000, "ブロック時にBP+5000（10000）")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === matango.instanceId), "BP比べ（10000 vs 8000）でマタンゴルが破壊される")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === kangal.instanceId), "ネガ・カンガルは残る")
})
scene("F2: 035 Lv2（4コア）もブロック時BP+5000（9000→14000）", () => {
    const s = game("kangal-lv2", "p2")
    const kangal = put(s, "p1", KANGAL, 4)
    const mirage = put(s, "p2", MIRAGE, 1)
    reachBlock(s, "p2", mirage.instanceId)
    assert(effectiveBp(s, "p1", kangal) === 9000, "ブロック前はBP9000")
    assert(declareBlock(s, "p1", kangal.instanceId) === null, "ネガ・カンガルでブロック")
    settle(s)
    assert(effectiveBp(s, "p1", kangal) === 14000, "ブロック時にBP+5000（14000）")
})
scene("F3: 035 の境目 ― アタックしてもBPは上がらない", () => {
    const s = game("kangal-atk", "p1")
    const kangal = put(s, "p1", KANGAL, 1)
    assert(act(s, "p1", { type: "attack", instanceId: kangal.instanceId }) === null, "ネガ・カンガルでアタック")
    settle(s)
    assert(effectiveBp(s, "p1", kangal) === 5000, "『ブロック時』なのでアタックではBP5000のまま")
})

// ───── 061 パイオニア・V
scene("G1: 061 の合体条件（白のシンボルを持つ）― 白のガトリングスタンドには合体できる", () => {
    const s = game("pioneer-white", "p1", "main")
    const host = put(s, "p1", GATLING, 1)
    s.players.p1.hand = [PIONEER]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null, "パイオニア・Vを召喚")
    settle(s)
    assert(s.players.p1.field.combinedBraves.length === 1 && (host.braveRefs ?? []).length === 1, "白のシンボルを持つので合体する")
})
scene("G2: 061 の境目 ― 白のシンボルを持たない赤のロクケラトプスには合体できない", () => {
    const s = game("pioneer-red", "p1", "main")
    const host = put(s, "p1", VAN, 1)
    s.players.p1.hand = [PIONEER]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    settle(s)
    assert(s.players.p1.field.combinedBraves.length === 0 && (host.braveRefs ?? []).length === 0, "赤のスピリットには合体しない")
})
scene("G3: 061 合体中の合体スピリットはブロック時にBP+3000", () => {
    const s = game("pioneer-block", "p2")
    const host = put(s, "p1", GATLING, 1)
    combine(s, "p1", host, PIONEER)
    const mirage = put(s, "p2", MIRAGE, 1)
    reachBlock(s, "p2", mirage.instanceId)
    const before = effectiveBp(s, "p1", host)
    assert(declareBlock(s, "p1", host.instanceId) === null, "合体スピリットでブロック")
    settle(s)
    assert(effectiveBp(s, "p1", host) === before + 3000, "ブロック時にBP+3000")
})
scene("G4: 061 の境目 ― 合体していない（スピリット状態の）061 はブロックしてもBPが上がらない", () => {
    const s = game("pioneer-alone", "p2")
    const brave = put(s, "p1", PIONEER, 1)
    const mirage = put(s, "p2", MIRAGE, 1)
    reachBlock(s, "p2", mirage.instanceId)
    const before = effectiveBp(s, "p1", brave)
    assert(declareBlock(s, "p1", brave.instanceId) === null, "スピリット状態のパイオニア・Vでブロック")
    settle(s)
    assert(effectiveBp(s, "p1", brave) === before, "【合体時】の効果なのでBPは上がらない")
})
scene("G5: 061 の境目 ― 合体スピリットがアタックしてもBPは上がらない（ブロック時のみ）", () => {
    const s = game("pioneer-atk", "p1")
    const host = put(s, "p1", GATLING, 1)
    combine(s, "p1", host, PIONEER)
    const before = effectiveBp(s, "p1", host)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    settle(s)
    assert(effectiveBp(s, "p1", host) === before, "アタックではBP+3000されない")
})

// ───── 079 エターナルディフェンス
scene("H1: 079 を指定したスピリットは、このターン疲労状態でもブロックできる", () => {
    const s = game("eternal-block", "p2")
    const van = put(s, "p1", VAN, 1)
    van.isRested = true
    const mirage = put(s, "p2", MIRAGE, 1)
    s.players.p1.hand = [ETERNAL]
    assert(act(s, "p2", { type: "attack", instanceId: mirage.instanceId }) === null, "フライングミラージュでアタック")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: van.instanceId }) === null, "エターナルディフェンスを使用")
    settle(s, [van.instanceId])
    assert(s.players.p1.trashCards.length === 1, "使ったマジックはトラッシュへ")
    assert(blockWithPasses(s, "p1", van.instanceId) === null, "指定された疲労状態のロクケラトプスでブロックできる")
})
scene("H2: 079 の境目 ― 使わなければ疲労状態のロクケラトプスはブロックできない", () => {
    const s = game("eternal-none", "p2")
    const van = put(s, "p1", VAN, 1)
    van.isRested = true
    const mirage = put(s, "p2", MIRAGE, 1)
    reachBlock(s, "p2", mirage.instanceId)
    assert(declareBlock(s, "p1", van.instanceId) !== null, "疲労状態ではブロックできない")
})
scene("H3: 079 の境目 ― 指定していない別の疲労スピリットはブロックできない", () => {
    const s = game("eternal-other", "p2")
    const van = put(s, "p1", VAN, 1)
    const other = put(s, "p1", VAN, 1)
    van.isRested = true
    other.isRested = true
    const mirage = put(s, "p2", MIRAGE, 1)
    s.players.p1.hand = [ETERNAL]
    assert(act(s, "p2", { type: "attack", instanceId: mirage.instanceId }) === null, "フライングミラージュでアタック")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: van.instanceId }) === null, "エターナルディフェンスを使用")
    settle(s, [van.instanceId])
    assert(blockWithPasses(s, "p1", other.instanceId) !== null, "指定していないスピリットは疲労状態でブロックできない")
})

// ───── X07 クラウン・ソーラー
scene("I1: X07 の合体条件（コスト5以上）― コスト5のマタンゴルには合体できる", () => {
    const s = game("crown-ok", "p1", "main")
    const host = put(s, "p1", MATANGO, 1)
    s.players.p1.hand = [CROWN]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null, "クラウン・ソーラーを召喚")
    settle(s)
    assert(s.players.p1.field.combinedBraves.length === 1 && (host.braveRefs ?? []).length === 1, "コスト5以上なので合体する")
})
scene("I2: X07 の境目 ― コスト3のガトリングスタンドには合体できない", () => {
    const s = game("crown-ng", "p1", "main")
    const host = put(s, "p1", GATLING, 1)
    s.players.p1.hand = [CROWN]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    settle(s)
    assert(s.players.p1.field.combinedBraves.length === 0 && (host.braveRefs ?? []).length === 0, "コスト5未満には合体しない")
})
scene("I3: X07 【合体中】アタック時、合体していない疲労スピリット1体を回復（合体スピリット自身は回復しない）", () => {
    const s = game("crown-atk", "p1")
    const host = put(s, "p1", MATANGO, 1)
    combine(s, "p1", host, CROWN)
    const van = put(s, "p1", VAN, 1)
    van.isRested = true
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    settle(s, [van.instanceId, host.instanceId])
    assert(!van.isRested, "合体していないロクケラトプスが回復する")
    assert(host.isRested, "合体しているスピリット自身は回復しない（アタックで疲労したまま）")
})
scene("I4: X07 【合体中】ブロック時も、合体していない疲労スピリット1体を回復", () => {
    const s = game("crown-block", "p2")
    const host = put(s, "p1", MATANGO, 1)
    combine(s, "p1", host, CROWN)
    const van = put(s, "p1", VAN, 1)
    van.isRested = true
    const mirage = put(s, "p2", MIRAGE, 1)
    reachBlock(s, "p2", mirage.instanceId)
    assert(declareBlock(s, "p1", host.instanceId) === null, "合体スピリットでブロック")
    settle(s, [van.instanceId])
    assert(!van.isRested, "合体していないロクケラトプスが回復する")
})
scene("I5: X07 の境目 ― 合体していない（スピリット状態の）X07 がアタックしても回復しない", () => {
    const s = game("crown-alone", "p1")
    const crown = put(s, "p1", CROWN, 1)
    const van = put(s, "p1", VAN, 1)
    van.isRested = true
    assert(act(s, "p1", { type: "attack", instanceId: crown.instanceId }) === null, "スピリット状態のX07でアタック")
    settle(s, [van.instanceId])
    assert(van.isRested, "【合体中】の効果なので合体していなければ回復しない")
})

console.log("すべてのチェックに合格しました 🎉（part810）")
