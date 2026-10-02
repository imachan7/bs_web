// smoke パート456（「〜することで〜する」の払う確認。ユーザー確定 2026-09-29）
// 規則：①対話中は払うかを持ち主に必ず確認 ②二重に聞かない ③聞く前に払えないなら確認は出さず何も起きない（2026-10-02 改訂） ④非対話は確認なしで払えるなら払う
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const SATELLITE = "BS13-068"
const DENNIS = "BS03-088"
const SEVENTH = "BS02-091"
const VANILLA = "BS01-002"
const BIG = "BS01-031" // デス・ハーデス（紫・効果なし・Lv2 コア4 で BP7000。赤でないのでマジックのコスト軽減が掛からない）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SATELLITE).name === "遥かなる衛星砲" && getCard(SATELLITE).type === "nexus", "SATELLITEは衛星砲")
    assert(getCard(DENNIS).name === "城壊しのデニス" && getCard(DENNIS).type === "spirit", "DENNISはデニス")
    assert(getCard(SEVENTH).name === "セブンスクリムゾン" && getCard(SEVENTH).type === "magic", "SEVENTHはセブンスクリムゾン")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).effects.length === 0, "VANILLAは効果なし")
    assert(getCard(BIG).name === "デス・ハーデス" && getCard(BIG).effects.length === 0 && !getCard(BIG).colors.includes("red"), "BIGは赤でない効果なしのデス・ハーデス")
}

// 払うかの確認：kind が option で「発動する」を含む選択待ち
const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option" && (pc.options ?? []).includes("発動する")
}

// 選択待ちを答え切る。確認が出たら answer（"press"=押す／"decline"=断る）で答え、出た回数を返す。確認以外は先頭の候補で答える
function drive(t: ScenarioCtx, answer: "press" | "decline"): number {
    let confirms = 0
    while (t.state.pendingChoice) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(t)) {
            confirms++
            t.act(side, answer === "press" ? { type: "resolveChoice", option: "発動する" } : { type: "resolveChoice" })
        } else {
            t.act(side, pc.kind === "option" ? { type: "resolveChoice", option: pc.options![0]! } : { type: "resolveChoice", instanceId: pc.candidates[0]! })
        }
        if (confirms > 5) throw new Error("確認が繰り返し出ている")
    }
    return confirms
}

const cannonMe = (rested = false) => ({ nexuses: [{ card: SATELLITE, cores: 1, rested }] })

// 相手がロクケラトプスでアタックする
function oppAttack(t: ScenarioCtx, answer: "press" | "decline", expectedConfirms: number) {
    let n = 0
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
    n += drive(t, answer)
    if (t.state.battle) {
        t.closeFlash()
        n += drive(t, answer)
        if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" })
        n += drive(t, answer)
    }
    assert(n === expectedConfirms, `確認の回数は${expectedConfirms}回（実際 ${n} 回）`)
}

console.log("=== 1. 衛星砲・対話：押すと衛星砲が疲労し、アタッカーが手札に戻る ===")
scenario({
    name: "sat-press",
    start: { turn: "opp", interactive: true, me: cannonMe(), opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => oppAttack(t, "press", 1),
    expect: [
        "自分.遥かなる衛星砲.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 2. 衛星砲・対話：断ると何も払わず、アタックは続く ===")
scenario({
    name: "sat-decline",
    start: { turn: "opp", interactive: true, me: cannonMe(), opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => oppAttack(t, "decline", 1),
    expect: [
        "相手.ロクケラトプス.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})

console.log("=== 3. 衛星砲・対話：疲労済み（払えない）なら確認は出ない。何も起きない ===")
scenario({
    name: "sat-cannot-pay",
    start: { turn: "opp", interactive: true, me: cannonMe(true), opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => oppAttack(t, "press", 0),
    expect: [
        "相手.ロクケラトプス.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})

console.log("=== 4. 衛星砲・非対話：確認なしで払って手札に戻る ===")
scenario({
    name: "sat-noninteractive",
    start: { turn: "opp", interactive: false, me: cannonMe(), opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => oppAttack(t, "press", 0),
    expect: [
        "自分.遥かなる衛星砲.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// 自分のターンにデニスでアタック。バトル中（フラッシュを閉じる前）の盤面で照合する
function dennisAttack(t: ScenarioCtx, answer: "press" | "decline") {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("城壊しのデニス") })
    const n = drive(t, answer)
    assert(n === 1, `確認は1回だけ（実際 ${n} 回）`)
}

console.log("=== 5. デニス・対話：確認は1回。押すと手札のネクサスを捨ててBP+5000 ===")
scenario({
    name: "dennis-press",
    start: { interactive: true, me: { hand: [SATELLITE], spirits: [{ card: DENNIS }] } },
    steps: (t) => dennisAttack(t, "press"),
    expect: [
        "自分.城壊しのデニス.疲労: false → true",
        "自分.城壊しのデニス.BP: 4000 → 9000",
        "自分.手札: 遥かなる衛星砲 → なし",
        "自分.トラッシュ: なし → 遥かなる衛星砲",
    ],
})

console.log("=== 6. デニス・対話：断ると何も起きない ===")
scenario({
    name: "dennis-decline",
    start: { interactive: true, me: { hand: [SATELLITE], spirits: [{ card: DENNIS }] } },
    steps: (t) => dennisAttack(t, "decline"),
    expect: ["自分.城壊しのデニス.疲労: false → true"],
})

console.log("=== 7. セブンスクリムゾン・対話：発動の確認は出ず、そのまま解決する ===")
{
    // 自分のスピリットはコア0になって消滅（トラッシュへ）。相手のスピリットはコア8個から7個がリザーブへ
    const gone = [getCard(SEVENTH).name, getCard(BIG).name].sort().join("、")
    scenario({
        name: "seventh-no-confirm",
        start: {
            interactive: true,
            me: { hand: [SEVENTH], spirits: [{ card: BIG, cores: 4 }] },
            opp: { spirits: [{ card: VANILLA, cores: 8 }] },
        },
        steps: (t) => {
            t.act("me", { type: "castMagic", handIndex: 0 })
            const n = drive(t, "press")
            assert(n === 0, `発動の確認は1回も出ない（実際 ${n} 回）`)
        },
        expect: [
            "自分.手札: セブンスクリムゾン → なし",
            "自分.トラッシュ: なし → " + gone,
            "自分.トラッシュのコア: 0 → 7", // マジックのコスト7（赤のシンボルが自分の場に無いので軽減なし）
            "自分.リザーブ: 10 → 3",
            "自分.デス・ハーデス.場所: フィールド → なし",
            "相手.ロクケラトプス.コア: 8 → 1",
            "相手.ロクケラトプス.Lv: 3 → 1",
            "相手.ロクケラトプス.BP: 4000 → 1000",
            "相手.リザーブ: 10 → 17",
        ],
    })
}

console.log("すべてのチェックに合格しました 🎉（part456）")
