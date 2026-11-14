// smoke パート946（合体中のブレイヴの誘発は別のカードの効果なので、ホストの誘発と同時に発揮すれば解決順を聞く。#545・TIMING_CHART §0-3）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import { attachBrave } from "../../server/src/logic/EffectModules"

const LEO = "X13-04" // 獅機鎧神ヴァルハランス・レオ（Lv2『バトル時』白のスピリット1体を疲労させることで BP+）
const CROWN = "BS21-X07" // 天空の光剣クラウン・ソーラー（【合体中】『アタック時』合体していない自分のスピリット1体を回復）
const WHITE = "BS01-074" // バーサーカー・ガン（白・バニラ）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(LEO).name === "獅機鎧神ヴァルハランス・レオ" && getCard(LEO).effects.some((e) => e.kind === "triggered" && e.trigger === "onBattleStart"), "LEOはバトル時の効果を持つ")
    assert(getCard(CROWN).name === "天空の光剣クラウン・ソーラー" && getCard(CROWN).type === "brave", "CROWNはブレイヴ")
    assert(getCard(WHITE).name === "バーサーカー・ガン" && getCard(WHITE).effects.length === 0, "WHITEは白のバニラ")
}

console.log("=== レオ＋クラウンでアタック：レオのバトル時とクラウンのアタック時の解決順を聞き、レオを先にすれば疲労させたスピリットが回復する ===")
{
    const s = createGame("p944", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    const leo = createInstance(LEO, s.turn, 2)
    const white = createInstance(WHITE, s.turn, 1)
    s.players.p1.field.spirits.push(leo, white)
    attachBrave(s, "p1", leo, createInstance(CROWN, s.turn, 0))
    refreshLevelAsOverrides(s)
    s.phase = "attack"
    act(s, "p1", { type: "attack", instanceId: leo.instanceId })
    const opts = s.pendingChoice?.options ?? []
    assert(s.pendingChoice?.triggerOrder !== undefined, `解決順の質問（${s.pendingChoice?.prompt ?? "なし"}）`)
    assert(opts.some((o) => o.includes("ヴァルハランス・レオ")) && opts.some((o) => o.includes("クラウン・ソーラー")), `選択肢はレオとクラウンの2つ（${opts.join(" / ")}）`)
    act(s, "p1", { type: "resolveChoice", option: opts.find((o) => o.includes("ヴァルハランス・レオ"))! })
    // 以降の確認・対象の選択は先頭の選択肢で答える（白のスピリットは1体だけ）
    for (let i = 0; i < 10 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        if (pc.options?.length) act(s, pc.pid ?? "p1", { type: "resolveChoice", option: pc.options[0]! })
        else if (pc.candidates?.length) act(s, pc.pid ?? "p1", { type: "resolveChoice", instanceId: pc.candidates[0]! })
        else break
    }
    assert(white.isRested === false, `レオで疲労させた白のスピリットを、後に解決したクラウンが回復した（${s.log.slice(-6).join(" | ")}）`)
}

console.log("すべてのチェックに合格しました 🎉（part946）")
