// smoke パート842（BS23-027 要塞蟲フォートコーカサス・BS23-033 機甲剣聖ミノタウロス：連鎖に反応する誘発。docs/design/BS19_PLAN.md §2.1）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const KOKASA = "BS23-027" // 要塞蟲フォートコーカサス（緑白・Lv1 コア1 BP7000／Lv2 コア3 BP11000・シンボル緑白）
const MINO = "BS23-033" // 機甲剣聖ミノタウロス（白・Lv1 コア1 BP3000）
const AMARANTH = "BS20-027" // アマランサス・パイパー（緑・アタック時：BP3000以下すべて疲労／連鎖[白]：相手1体を手札に戻す）
const PEGASIONE = "BS19-039" // ペガシオーネ（白・アタック時：BP4000以下を戻す／連鎖[緑]：ボイドからコア1個をこのスピリットに）
const MISSILIS = "BS20-031" // ミサイリス（白・ブロック時 BP+3000・連鎖[黄]）。黄シンボルが無い場面では連鎖は発揮されない
const KONTON = "BS19-051" // 凶獣コントン（黄・コスト4・召喚時の連鎖[白]：相手1体を手札に戻す）
const JAKO = "BS22-033" // ジャコウ・キャット（白・コスト4・軽減 白白紫・召喚時の連鎖[紫]：1枚ドロー）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3・軽減 紫・召喚時：1枚ドロー。連鎖なし）
const HADES = "BS01-031" // デス・ハーデス（紫・バニラ。紫シンボル要員）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・バニラ Lv1 BP4000／Lv2 コア3 BP6000）
const KAMO = "BS10-024" // カモメーヴェ（緑・バニラ Lv1 BP4000）
const GUN = "BS01-074" // バーサーカー・ガン（白・バニラ BP1000。白シンボル要員）
const BEETLE = "BS01-050" // ビートビートル（緑・バニラ BP1000）
const ROKU = "BS01-002" // ロクケラトプス（赤・バニラ BP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Array<[string, string]> = [
        [KOKASA, "要塞蟲フォートコーカサス"], [MINO, "機甲剣聖ミノタウロス"], [AMARANTH, "アマランサス・パイパー"], [PEGASIONE, "ペガシオーネ"],
        [MISSILIS, "ミサイリス"], [KONTON, "凶獣コントン"], [JAKO, "ジャコウ・キャット"], [GRIP, "グリプ・ハンズ"], [HADES, "デス・ハーデス"],
        [HERA, "ヘラクレス・ジオ"], [KAMO, "カモメーヴェ"], [GUN, "バーサーカー・ガン"], [BEETLE, "ビートビートル"], [ROKU, "ロクケラトプス"],
    ]
    for (const [id, name] of names) assert(getCard(id).name === name, `${id} は ${name}`)
}

// 選択待ちを答え切る。target は labels を前から順に使う（候補に入っているものだけ）、option は optionRe に合うもの（なければ先頭）
function settle(t: ScenarioCtx, labels: string[] = [], optionRe: RegExp = /./): void {
    const queue = [...labels]
    for (let i = 0; i < 12 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "target") {
            const hit = queue.findIndex((l) => {
                try {
                    return pc.candidates.includes(t.id(l))
                } catch {
                    return false
                }
            })
            assert(hit >= 0, `対象の選択待ちに答えられる（候補: ${pc.candidates.length}件、残り: ${queue.join("、")}）`)
            if (hit < 0) return
            t.act(side, { type: "resolveChoice", instanceId: t.id(queue.splice(hit, 1)[0]!) })
        } else if (pc.kind === "option") {
            const opt = (pc.options ?? []).find((o) => optionRe.test(o)) ?? (pc.options ?? [])[0]
            t.act(side, { type: "resolveChoice", option: opt! })
        } else {
            t.act(side, { type: "resolveChoice", cardIndex: (pc.cardIndices ?? [])[0]! })
        }
    }
    assert(t.state.pendingChoice === null, "選択待ちが残らない")
}

console.log("=== 1. 027 Lv1：アタック中の自分の連鎖[白]が発揮 → 相手1体を疲労（連鎖の戻す対象とは別の1体） ===")
scenario({
    name: "kokasa-white-chain-rests",
    start: {
        interactive: true,
        me: { spirits: [{ card: KOKASA, label: "コーカサス" }, { card: AMARANTH, label: "パイパー" }] },
        opp: { spirits: [{ card: HERA, label: "ジオ" }, { card: KAMO, label: "カモメ" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("パイパー") })
        settle(t, ["ジオ", "カモメ"])
    },
    expect: [
        "自分.パイパー.疲労: false → true",
        "相手.ジオ.場所: フィールド → なし",
        "相手.手札: なし → ヘラクレス・ジオ",
        "相手.リザーブ: 10 → 11",
        "相手.カモメ.疲労: false → true",
    ],
})

console.log("=== 2. 027：アタックしていないスピリットの連鎖（召喚時）では疲労させない ===")
scenario({
    name: "kokasa-summon-chain-no-rest",
    start: {
        interactive: true,
        me: { hand: [KONTON], spirits: [{ card: KOKASA, label: "コーカサス" }] },
        opp: { spirits: [{ card: HERA, label: "ジオ" }, { card: KAMO, label: "カモメ" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t, ["ジオ", "カモメ"])
    },
    expect: [
        "自分.手札: 凶獣コントン → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.凶獣コントン.場所: なし → フィールド",
        "自分.凶獣コントン.コア: なし → 1",
        "自分.凶獣コントン.疲労: なし → false",
        "自分.凶獣コントン.Lv: なし → 1",
        "自分.凶獣コントン.BP: なし → 2000",
        "相手.ジオ.場所: フィールド → なし",
        "相手.手札: なし → ヘラクレス・ジオ",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 3. 027：相手のスピリットの連鎖では疲労させない ===")
scenario({
    name: "kokasa-opp-chain",
    start: {
        turn: "opp",
        phase: "attack",
        interactive: true,
        me: { spirits: [{ card: KOKASA, label: "コーカサス" }, { card: KAMO, label: "カモメ" }] },
        opp: { spirits: [{ card: AMARANTH, label: "パイパー" }, { card: GUN, label: "ガン", rested: true }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("パイパー") })
        settle(t, ["カモメ"])
    },
    expect: [
        "相手.パイパー.疲労: false → true",
        "自分.カモメ.場所: フィールド → なし",
        "自分.手札: なし → カモメーヴェ",
        "自分.リザーブ: 10 → 11",
    ],
})

console.log("=== 4. 027 Lv2：連鎖[緑]が発揮 → 相手1体を手札に戻す ===")
scenario({
    name: "kokasa-green-chain-lv2-bounce",
    start: {
        interactive: true,
        me: { spirits: [{ card: KOKASA, label: "コーカサス", cores: 3 }, { card: PEGASIONE, label: "ペガ" }] },
        opp: { spirits: [{ card: HERA, label: "ジオ", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ペガ") })
        settle(t, ["ジオ"])
    },
    expect: [
        "自分.ペガ.疲労: false → true",
        "自分.ペガ.コア: 1 → 2",
        "自分.ペガ.Lv: 1 → 2",
        "自分.ペガ.BP: 3000 → 5000",
        "相手.ジオ.場所: フィールド → なし",
        "相手.手札: なし → ヘラクレス・ジオ",
        "相手.リザーブ: 10 → 13",
    ],
})

console.log("=== 5. 027 Lv1：[緑]の節は Lv2 から。連鎖[緑]が発揮しても戻さない ===")
scenario({
    name: "kokasa-green-chain-lv1-no-bounce",
    start: {
        interactive: true,
        me: { spirits: [{ card: KOKASA, label: "コーカサス" }, { card: PEGASIONE, label: "ペガ" }] },
        opp: { spirits: [{ card: HERA, label: "ジオ", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ペガ") })
        settle(t)
    },
    expect: [
        "自分.ペガ.疲労: false → true",
        "自分.ペガ.コア: 1 → 2",
        "自分.ペガ.Lv: 1 → 2",
        "自分.ペガ.BP: 3000 → 5000",
    ],
})

console.log("=== 6. 027：【連鎖】を持つ自分のスピリットがブロック → 回復 ===")
scenario({
    name: "kokasa-block-with-chain-recovers",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: KOKASA, label: "コーカサス", rested: true }, { card: MISSILIS, label: "ミサイリス" }] },
        opp: { spirits: [{ card: ROKU, label: "ロク" }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ロク") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ミサイリス") })
    },
    expect: [
        "相手.ロク.疲労: false → true",
        "自分.ミサイリス.疲労: false → true",
        "自分.ミサイリス.BP: 3000 → 6000",
        "自分.コーカサス.疲労: true → false",
    ],
})

console.log("=== 7. 027：【連鎖】を持たないスピリットのブロックでは回復しない ===")
scenario({
    name: "kokasa-block-without-chain",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: KOKASA, label: "コーカサス", rested: true }, { card: BEETLE, label: "ビートル" }] },
        opp: { spirits: [{ card: ROKU, label: "ロク" }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ロク") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ビートル") })
    },
    expect: ["相手.ロク.疲労: false → true", "自分.ビートル.疲労: false → true"],
})

console.log("=== 8. 027：相手の【連鎖】持ちがブロックしても回復しない（相手のアタックステップの節は自分の側だけ） ===")
scenario({
    name: "kokasa-opp-block-with-chain",
    start: {
        phase: "attack",
        me: { spirits: [{ card: KOKASA, label: "コーカサス", rested: true }, { card: ROKU, label: "ロク" }] },
        opp: { spirits: [{ card: MISSILIS, label: "ミサイリス" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロク") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ミサイリス") })
    },
    expect: ["自分.ロク.疲労: false → true", "相手.ミサイリス.疲労: false → true", "相手.ミサイリス.BP: 3000 → 6000"],
})

console.log("=== 9. 033：自分が連鎖でドロー → もう1枚ドロー（連鎖元のドローで合計2枚。033 自身のドローでは連鎖しない） ===")
scenario({
    name: "mino-chain-draw",
    start: {
        interactive: true,
        me: { hand: [JAKO], spirits: [{ card: MINO, label: "ミノタウロス" }, { card: HADES, label: "ハーデス" }] },
        opp: { spirits: [{ card: HERA, label: "ジオ" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t, ["ジオ"])
    },
    expect: [
        "自分.手札: ジャコウ・キャット → ロクケラトプス、ロクケラトプス",
        "自分.デッキ枚数: 40 → 38",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 2",
        "自分.ジャコウ・キャット.場所: なし → フィールド",
        "自分.ジャコウ・キャット.コア: なし → 1",
        "自分.ジャコウ・キャット.疲労: なし → false",
        "自分.ジャコウ・キャット.Lv: なし → 1",
        "自分.ジャコウ・キャット.BP: なし → 2000",
        "相手.ジオ.場所: フィールド → なし",
        "相手.手札: なし → ヘラクレス・ジオ",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 10. 033：連鎖以外のドローでは増えない ===")
scenario({
    name: "mino-plain-draw",
    start: {
        me: { hand: [GRIP], spirits: [{ card: MINO, label: "ミノタウロス" }, { card: HADES, label: "ハーデス" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: グリプ・ハンズ → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 2",
        "自分.グリプ・ハンズ.場所: なし → フィールド",
        "自分.グリプ・ハンズ.コア: なし → 1",
        "自分.グリプ・ハンズ.疲労: なし → false",
        "自分.グリプ・ハンズ.Lv: なし → 1",
        "自分.グリプ・ハンズ.BP: なし → 2000",
    ],
})

console.log("=== 11. 033：相手が連鎖でドローしても自分はドローしない ===")
scenario({
    name: "mino-opp-chain-draw",
    start: {
        turn: "opp",
        interactive: true,
        me: { spirits: [{ card: MINO, label: "ミノタウロス" }, { card: HERA, label: "ジオ" }] },
        opp: { hand: [JAKO], spirits: [{ card: HADES, label: "ハーデス" }] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        settle(t, ["ジオ"])
    },
    expect: [
        "相手.手札: ジャコウ・キャット → ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 3",
        "相手.ジャコウ・キャット.場所: なし → フィールド",
        "相手.ジャコウ・キャット.コア: なし → 1",
        "相手.ジャコウ・キャット.疲労: なし → false",
        "相手.ジャコウ・キャット.Lv: なし → 1",
        "相手.ジャコウ・キャット.BP: なし → 2000",
        "自分.ジオ.場所: フィールド → なし",
        "自分.手札: なし → ヘラクレス・ジオ",
        "自分.リザーブ: 10 → 11",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part842）")
