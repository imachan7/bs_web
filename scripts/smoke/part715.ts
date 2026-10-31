// smoke パート715（プロモ C1：PX13 冥府魔神オブシディオン。期待値役が効果文だけから書いた場面テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string, string][] = [
        ["PX13", "冥府魔神オブシディオン", "spirit"],
        ["BS01-002", "ロクケラトプス", "spirit"], // 赤・コスト1・バニラ
        ["BS06-013", "ピジョンヘディレス", "spirit"], // 紫・コスト0・バニラ
        ["BS01-058", "ヘラクレス・ジオ", "spirit"], // 緑・コスト3・Lv1でBP4000
        ["BS03-063", "ポニサス", "spirit"], // 黄・コスト5・Lv1(コア1)でBP4000・Lv2(コア3)でBP6000
        ["BS01-146", "ドリームリボン", "magic"], // 白・コスト4・フラッシュで相手のスピリット1体を手札に戻す
        ["BS04-102", "ドリームハンド", "magic"], // 白・コスト4・フラッシュでコスト1以下のスピリットすべてを持ち主の手札に戻す
    ]
    for (const [id, name, type] of expect) assert(getCard(id).name === name && getCard(id).type === type, `${id} は ${name}(${type})`)
    const c = (id: string) => getCard(id)
    assert(c("PX13").cost === 7 && c("PX13").colors[0] === "purple" && c("PX13").family.includes("魔神"), "PX13 は紫・コスト7・魔神")
    assert(c("PX13").levels[1]?.cores === 3 && c("PX13").levels[1]?.bp === 9000, "PX13 Lv2 はコア3・BP9000")
    assert(c("BS01-058").cost === 3 && c("BS01-002").cost === 1 && c("BS06-013").cost === 0 && c("BS03-063").cost === 5, "脇役のコスト")
    assert(c("BS03-063").levels[1]?.cores === 3 && c("BS03-063").levels[0]?.cores === 1, "ポニサスのLv境界")
    assert(c("BS01-146").cost === 4 && c("BS04-102").cost === 4 && c("BS01-146").colors[0] === "white", "ドリーム系は白・コスト4")
}

function settle(t: ScenarioCtx, attacker: Side): void {
    const defender: Side = attacker === "me" ? "opp" : "me"
    t.act(defender, { type: "pass" })
    t.act(attacker, { type: "pass" })
}
const V = "BS01-002"

// 選択待ちが残っているあいだ答える。対象の選択では prefer のスピリットを選び、それ以外は先頭の候補を選ぶ（実装が選択を出さなければ何もしない）
function answerAll(t: ScenarioCtx, prefer: string): void {
    for (let n = 0; n < 6 && t.state.pendingChoice; n++) {
        const pc = t.state.pendingChoice
        const side: Side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "target") {
            const want = t.id(prefer)
            const pick = pc.candidates.includes(want) ? want : pc.candidates[0]
            if (pick === undefined) return
            t.act(side, { type: "resolveChoice", instanceId: pick })
        } else if (pc.options?.[0] !== undefined) t.act(side, { type: "resolveChoice", option: pc.options[0] })
        else if (pc.cardIndices?.[0] !== undefined) t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else return
    }
}

console.log("=== PX13 / 激突：アタック時、相手は可能ならば必ずブロックする ===")
scenario({
    name: "PX13-激突で強制ブロック",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: "PX13", cores: 1 }] }, opp: { spirits: [{ card: "BS01-002", cores: 1 }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("冥府魔神オブシディオン") })
        settle(t, "me")
        t.actRejected("opp", { type: "takeLife" })
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: ["自分.冥府魔神オブシディオン.疲労: false → true", "相手.ロクケラトプス.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})

// 相手のターンのメインステップに、相手が白のフラッシュマジックを使う（コスト4を払い、手札は [マジック, V, V, ...]）
const OPP_PAY_4 = ["相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 4"]

console.log("=== PX13 / 相手の効果で自分のスピリット1体が手札に戻るとき、相手は手札1枚を破棄する ===")
scenario({
    name: "PX13-1体戻ると1枚破棄",
    start: {
        turn: "opp",
        phase: "main",
        interactive: true,
        // ドリームリボンは相手のスピリット1体（＝自分のどれか）を戻す。使う側（相手）がロクケラトプスを選ぶ（PX13自身ではない）
        me: { spirits: [{ card: "BS01-002", cores: 1 }, { card: "PX13", cores: 1 }] },
        opp: { hand: ["BS01-146", V, V] },
    },
    steps: (t) => {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        answerAll(t, "ロクケラトプス")
    },
    expect: [
        ...OPP_PAY_4,
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.リザーブ: 10 → 11",
        "自分.手札: なし → ロクケラトプス",
        "相手.手札: ドリームリボン、ロクケラトプス、ロクケラトプス → ロクケラトプス",
        "相手.トラッシュ: なし → ドリームリボン、ロクケラトプス",
    ],
})

console.log("=== PX13 / 戻るスピリット2体なら、相手は手札2枚を破棄する（戻るスピリット1体につき） ===")
scenario({
    name: "PX13-2体戻ると2枚破棄",
    start: {
        turn: "opp",
        phase: "main",
        me: { spirits: [{ card: "BS01-002", cores: 1 }, { card: "BS06-013", cores: 1 }, { card: "PX13", cores: 1 }] },
        opp: { hand: ["BS04-102", V, V, V] },
    },
    steps: (t) => {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    // ドリームハンドはコスト1以下を持ち主の手札へ（PX13はコスト7なので残る）
    expect: [
        ...OPP_PAY_4,
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.ピジョンヘディレス.場所: フィールド → なし",
        "自分.リザーブ: 10 → 12",
        "自分.手札: なし → ピジョンヘディレス、ロクケラトプス",
        "相手.手札: ドリームハンド、ロクケラトプス、ロクケラトプス、ロクケラトプス → ロクケラトプス",
        "相手.トラッシュ: なし → ドリームハンド、ロクケラトプス、ロクケラトプス",
    ],
})

console.log("=== PX13 / 戻るのが PX13 自身でも数える（「このスピリット以外」と書かれていない）：相手は手札1枚を破棄する ===")
scenario({
    name: "PX13-自身が戻されても破棄",
    start: { turn: "opp", phase: "main", me: { spirits: [{ card: "PX13", cores: 1 }] }, opp: { hand: ["BS01-146", V, V] } },
    steps: (t) => {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [
        ...OPP_PAY_4,
        "自分.冥府魔神オブシディオン.場所: フィールド → なし",
        "自分.リザーブ: 10 → 11",
        "自分.手札: なし → 冥府魔神オブシディオン",
        "相手.手札: ドリームリボン、ロクケラトプス、ロクケラトプス → ロクケラトプス",
        "相手.トラッシュ: なし → ドリームリボン、ロクケラトプス",
    ],
})

console.log("=== PX13 / 自分の効果で自分のスピリットを戻すときは、相手は破棄しない（相手によって戻るとき限定） ===")
scenario({
    name: "PX13-自分の効果では破棄させない",
    start: {
        turn: "me",
        phase: "main",
        me: { hand: ["BS04-102"], spirits: [{ card: "BS01-002", cores: 1 }, { card: "PX13", cores: 1 }] },
        opp: { hand: [V, V], spirits: [{ card: "BS06-013", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    // ドリームハンドは、お互いのコスト1以下のスピリットを持ち主の手札へ戻す。自分のロクケラトプスは自分の効果、相手のピジョンヘディレスは相手自身のスピリット
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → ドリームハンド",
        "自分.手札: ドリームハンド → ロクケラトプス",
        "自分.ロクケラトプス.場所: フィールド → なし",
        "相手.ピジョンヘディレス.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "相手.手札: ロクケラトプス、ロクケラトプス → ピジョンヘディレス、ロクケラトプス、ロクケラトプス",
    ],
})

console.log("=== PX13 / PX13 がいなければ、相手の効果で戻っても相手は破棄しない（対照） ===")
scenario({
    name: "PX13-いなければ破棄なし",
    start: {
        turn: "opp",
        phase: "main",
        me: { spirits: [{ card: "BS01-002", cores: 1 }] },
        opp: { hand: ["BS01-146", V, V] },
    },
    steps: (t) => {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [
        ...OPP_PAY_4,
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.リザーブ: 10 → 11",
        "自分.手札: なし → ロクケラトプス",
        "相手.手札: ドリームリボン、ロクケラトプス、ロクケラトプス → ロクケラトプス、ロクケラトプス",
        "相手.トラッシュ: なし → ドリームリボン",
    ],
})

// ── アタック時：相手のスピリットにブロックされたとき、ブロックしたスピリットのコスト1につき、ブロックしていない相手のスピリット上のコア1個を相手のトラッシュに置く ──
console.log("=== PX13 Lv2 / ブロックしたヘラクレス・ジオ（コスト3）につき、ブロックしていないポニサスのコア3個をトラッシュへ ===")
scenario({
    name: "PX13-Lv2でコスト3ぶん",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "PX13", cores: 3 }] },
        opp: { spirits: [{ card: "BS01-058", cores: 1 }, { card: "BS03-063", cores: 4 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("冥府魔神オブシディオン") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ヘラクレス・ジオ") })
        t.closeFlash()
    },
    // ポニサスはコア4→1でLv2→Lv1（BP6000→4000）。ヘラクレス・ジオ(4000)は PX13(9000)に破壊され、コア1個がリザーブへ
    expect: [
        "自分.冥府魔神オブシディオン.疲労: false → true",
        "相手.ポニサス.コア: 4 → 1",
        "相手.ポニサス.Lv: 2 → 1",
        "相手.ポニサス.BP: 6000 → 4000",
        "相手.トラッシュのコア: 0 → 3",
        "相手.ヘラクレス・ジオ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヘラクレス・ジオ",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== PX13 Lv2 / ブロックしたのがコスト1なら、取り除くコアも1個 ===")
scenario({
    name: "PX13-Lv2でコスト1ぶん",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "PX13", cores: 3 }] },
        opp: { spirits: [{ card: "BS01-002", cores: 1 }, { card: "BS03-063", cores: 4 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("冥府魔神オブシディオン") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    // ポニサスはコア4→3（Lv2のまま）
    expect: [
        "自分.冥府魔神オブシディオン.疲労: false → true",
        "相手.ポニサス.コア: 4 → 3",
        "相手.トラッシュのコア: 0 → 1",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== PX13 Lv1 / この節はLv2・3限定：ブロックされてもコアを取り除かない ===")
scenario({
    name: "PX13-Lv1では取り除かない",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "PX13", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-058", cores: 1 }, { card: "BS03-063", cores: 4 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("冥府魔神オブシディオン") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ヘラクレス・ジオ") })
        t.closeFlash()
    },
    // PX13 Lv1(6000)がヘラクレス・ジオ(4000)に勝つ
    expect: [
        "自分.冥府魔神オブシディオン.疲労: false → true",
        "相手.ヘラクレス・ジオ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヘラクレス・ジオ",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== PX13 Lv2 / ブロックされなかったとき（ブロックできるスピリットがいない）は何も取り除かない ===")
scenario({
    name: "PX13-ブロックされなければ取り除かない",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "PX13", cores: 3 }] },
        opp: { spirits: [{ card: "BS03-063", cores: 4, rested: true }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("冥府魔神オブシディオン") })
        settle(t, "me")
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.冥府魔神オブシディオン.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("すべてのチェックに合格しました 🎉（part715）")
