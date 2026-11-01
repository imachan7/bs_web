// smoke パート742（BS19-X02 冥府三巨頭バロック・ボルドー：「相手によって…手札かデッキに戻るとき、下のカード1枚を破棄することで、回復状態でフィールドに残る」の戻る側。破壊の側は part733）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const BAROQUE = "BS19-X02"
const ROKU = "BS01-002"
const RIBBON = "BS01-146" // ドリームリボン（白・マジック4・フラッシュ：相手のスピリット1体を手札に戻す）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BAROQUE).name === "冥府三巨頭バロック・ボルドー" && getCard(BAROQUE).cost === 8, "BAROQUE")
    assert(getCard(RIBBON).name === "ドリームリボン" && getCard(RIBBON).type === "magic" && getCard(RIBBON).cost === 4, "RIBBON")
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).colors[0] === "red", "ROKU（白の軽減に数えない）")
}

console.log("=== 下のカードがあれば、1枚破棄して回復状態で残る ===")
scenario({
    name: "baroque-bounce-stay",
    start: { me: { hand: [BAROQUE, ROKU, ROKU] }, opp: { spirits: [{ card: ROKU, label: "アタッカー" }], hand: [RIBBON] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("me", { type: "pass" })
        const baroque = t.state.players[t.me].field.spirits.find((s) => s.cardId === BAROQUE)!.instanceId
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: baroque })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ロクケラトプス、ロクケラトプス、冥府三巨頭バロック・ボルドー → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 8",
        "自分.冥府三巨頭バロック・ボルドー.場所: なし → フィールド",
        "自分.冥府三巨頭バロック・ボルドー.疲労: なし → false",
        "自分.冥府三巨頭バロック・ボルドー.コア: なし → 1",
        "自分.冥府三巨頭バロック・ボルドー.Lv: なし → 1",
        "自分.冥府三巨頭バロック・ボルドー.BP: なし → 6000",
        "自分.トラッシュ: なし → ロクケラトプス", // 下のカード1枚
        "自分.ライフ: 5 → 4",
        "相手.アタッカー.疲労: false → true",
        "相手.手札: ドリームリボン → ロクケラトプス",
        "相手.リザーブ: 10 → 7", // コアステップ+1、ドリームリボン4（白の軽減なし）
        "相手.トラッシュ: なし → ドリームリボン",
        "相手.トラッシュのコア: 0 → 4",
        "相手.デッキ枚数: 40 → 39",
    ],
})

console.log("=== 下のカードが無ければ払えないので手札に戻る ===")
scenario({
    name: "baroque-bounce-no-under",
    start: { me: { hand: [BAROQUE] }, opp: { spirits: [{ card: ROKU, label: "アタッカー" }], hand: [RIBBON] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("me", { type: "pass" })
        const baroque = t.state.players[t.me].field.spirits.find((s) => s.cardId === BAROQUE)!.instanceId
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: baroque })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 3", // 召喚8＋維持1、戻ったバロックのコア1とライフのコア1がリザーブへ
        "自分.トラッシュのコア: 0 → 8",
        "自分.ライフ: 5 → 4",
        "相手.アタッカー.疲労: false → true",
        "相手.手札: ドリームリボン → ロクケラトプス",
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュ: なし → ドリームリボン",
        "相手.トラッシュのコア: 0 → 4",
        "相手.デッキ枚数: 40 → 39",
    ],
})

console.log("=== 対話あり：残すかを持ち主が選ぶ（「〜することで」は任意。2026-11-02 ユーザー指示） ===")
const bounceSteps = (answer: "残す" | "断る") => (t: import("./scenario").ScenarioCtx) => {
    t.act("me", { type: "summon", handIndex: 0 })
    // 召喚時の「手札3枚までを下に置く」の選択に答える（いちばん多く置く選択肢）
    for (let i = 0; i < 5 && t.state.pendingChoice; i++) {
        const opts = t.state.pendingChoice.options ?? []
        const last = opts[opts.length - 1]
        t.act("me", last !== undefined ? { type: "resolveChoice", option: last } : { type: "resolveChoice" })
    }
    t.act("me", { type: "endTurn" })
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
    t.act("me", { type: "pass" })
    const baroque = t.state.players[t.me].field.spirits.find((s) => s.cardId === BAROQUE)!.instanceId
    t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: baroque })
    const pc = t.state.pendingChoice as { pid: string; kind: string; options?: string[] } | null
    assert(pc !== null && pc.pid === t.me && pc.kind === "option" && (pc.options ?? []).includes("残す"), "戻る前に持ち主へ「残す」かを聞く")
    t.act("me", answer === "残す" ? { type: "resolveChoice", option: "残す" } : { type: "resolveChoice" })
    t.closeFlash()
    t.act("me", { type: "takeLife" })
}
scenario({
    name: "baroque-bounce-ask-stay",
    start: { interactive: true, me: { hand: [BAROQUE, ROKU, ROKU] }, opp: { spirits: [{ card: ROKU, label: "アタッカー" }], hand: [RIBBON] } },
    steps: bounceSteps("残す"),
    expect: [
        "自分.手札: ロクケラトプス、ロクケラトプス、冥府三巨頭バロック・ボルドー → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 8",
        "自分.冥府三巨頭バロック・ボルドー.場所: なし → フィールド",
        "自分.冥府三巨頭バロック・ボルドー.疲労: なし → false",
        "自分.冥府三巨頭バロック・ボルドー.コア: なし → 1",
        "自分.冥府三巨頭バロック・ボルドー.Lv: なし → 1",
        "自分.冥府三巨頭バロック・ボルドー.BP: なし → 6000",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.ライフ: 5 → 4",
        "相手.アタッカー.疲労: false → true",
        "相手.手札: ドリームリボン → ロクケラトプス",
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュ: なし → ドリームリボン",
        "相手.トラッシュのコア: 0 → 4",
        "相手.デッキ枚数: 40 → 39",
    ],
})
scenario({
    name: "baroque-bounce-ask-decline",
    start: { interactive: true, me: { hand: [BAROQUE, ROKU, ROKU] }, opp: { spirits: [{ card: ROKU, label: "アタッカー" }], hand: [RIBBON] } },
    steps: bounceSteps("断る"),
    expect: [
        "自分.手札: ロクケラトプス、ロクケラトプス、冥府三巨頭バロック・ボルドー → 冥府三巨頭バロック・ボルドー",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 8",
        "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス", // 場を離れるとき下のカードは破棄
        "自分.ライフ: 5 → 4",
        "相手.アタッカー.疲労: false → true",
        "相手.手札: ドリームリボン → ロクケラトプス",
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュ: なし → ドリームリボン",
        "相手.トラッシュのコア: 0 → 4",
        "相手.デッキ枚数: 40 → 39",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part742）")
