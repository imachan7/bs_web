// smoke パート856（BS23 紫バッチ：057 ザグナ・オリックス・076 ヴァニシングコア・X02 白蛇帝アルデウス・ヴァイパー・X08 紫電の霊剣ライトニング・シオン。
// BS23_PLAN §1 の X02・X08 の行（Q4592・Q20368・Q20369・Q20371・Q20372・Q17923）と効果文から）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const ZAGNA = "BS23-057"
const VANISHING = "BS23-076"
const VIPER = "BS23-X02"
const SHION = "BS23-X08"
const ALDEUS = "BS23-017" // 合体条件コスト5以上のホスト（コスト6）
const SERAS = "BS23-014" // 合体条件コスト4以上のホスト（コスト4・Lv1 BP3000／Lv2 3コア）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1 BP1000／Lv2 2コア BP3000／Lv3 3コア BP4000）
const BEETLE = "BS01-050" // ビートビートル（緑・コスト0・Lv1 BP1000／Lv2 2コア）
const KIGUNA = "BS07-029" // キグナ・スワン（白・機獣・コスト1・Lv1 BP1000／Lv2 2コア BP2000）
const BERSERKER = "BS01-074" // バーサーカー・ガン（白・動器・コスト1）
const SMOG = "BS06-014" // スモッグゴート（紫・コスト1・軽減なし。召喚時：相手のスピリット上のコア1個を相手のリザーブへ）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, n: string, type: string, cost: number) =>
        assert(getCard(id).name === n && getCard(id).type === type && getCard(id).cost === cost, `${id} は ${n}（${type}・コスト${cost}）`)
    chk(ZAGNA, "ザグナ・オリックス", "brave", 4)
    chk(VANISHING, "ヴァニシングコア", "magic", 5)
    chk(VIPER, "白蛇帝アルデウス・ヴァイパー", "spirit", 10)
    chk(SHION, "紫電の霊剣ライトニング・シオン", "brave", 6)
    chk(ALDEUS, "シャドー・アルデウス", "spirit", 6)
    chk(SERAS, "ボーン・セーラス", "spirit", 4)
    chk(ROKU, "ロクケラトプス", "spirit", 1)
    chk(BEETLE, "ビートビートル", "spirit", 0)
    chk(KIGUNA, "キグナ・スワン", "spirit", 1)
    chk(BERSERKER, "バーサーカー・ガン", "spirit", 1)
    chk(SMOG, "スモッグゴート", "spirit", 1)
    assert(getCard(KIGUNA).family?.includes("機獣") === true && getCard(BERSERKER).family?.includes("機獣") !== true, "キグナは機獣・バーサーカー・ガンは違う")
    assert(getCard(BEETLE).colors.join() === "green" && getCard(BERSERKER).colors.join() === "white" && getCard(KIGUNA).colors.join() === "white", "ビートルは緑・キグナとバーサーカー・ガンは白")
}

const name = (id: string) => getCard(id).name
const born = (id: string, cores: number, lv: number, bp: number) => [
    `自分.${name(id)}.場所: なし → フィールド`, `自分.${name(id)}.疲労: なし → false`, `自分.${name(id)}.コア: なし → ${cores}`,
    `自分.${name(id)}.Lv: なし → ${lv}`, `自分.${name(id)}.BP: なし → ${bp}`,
]
const aroku = name(ROKU)
const drew = (hand: string) => [`自分.手札: ${hand} → ${aroku}`, "自分.デッキ枚数: 40 → 39"]
// 相手の標的（ROKU）のコアを選ぶ場面を、選択待ちを止めて答える
function pickTarget(t: { act: (s: "me" | "opp", a: { type: "resolveChoice"; instanceId?: string }) => void; id: (l: string) => string; state: { pendingChoice: { pid: string; candidates: string[] } | null }; me: string }, label = "標的") {
    const target = t.id(label)
    for (let i = 0; i < 3 && t.state.pendingChoice !== null; i++) {
        const pc = t.state.pendingChoice
        t.act(pc.pid === t.me ? "me" : "opp", pc.candidates.includes(target) ? { type: "resolveChoice", instanceId: target } : { type: "resolveChoice" })
    }
}

// --- BS23-057 ----------------------------------------------------------------
// 合体するとブレイヴのコアはホストへ移る。【合体時】のアタック時効果なので、ホストが合体中に攻撃する
console.log("=== 057: 合体時のアタック時に疲労状態の相手のスピリットを指定してアタック／白シンボルがあれば機獣へコア1個 ===")
const serasN = name(SERAS)
function zagna(label: string, ally: string | null, targetRested: boolean, expectChain: boolean) {
    scenario({
        name: label,
        start: {
            me: { spirits: [{ card: SERAS }, { card: ZAGNA, label: "ザグナ" }, ...(ally ? [{ card: ally }] : [])] },
            opp: { spirits: [{ card: ROKU, label: "標的", rested: targetRested }] },
        },
        steps(t) {
            t.act("me", { type: "combineBrave", braveInstanceId: t.id("ザグナ"), hostInstanceId: t.id(serasN) })
            t.act("me", { type: "nextPhase" })
            const attack = { type: "attack" as const, instanceId: t.id(serasN), targetSpiritInstanceId: t.id("標的") }
            if (!targetRested) return t.actRejected("me", attack)
            t.act("me", attack)
            t.closeFlash()
        },
        expect: [
            `自分.${serasN}.コア: 1 → 2`, `自分.${serasN}.BP: 3000 → 6000`, "自分.ザグナ.場所: フィールド → 合体", "自分.ザグナ.コア: 1 → 0", "自分.ザグナ.BP: 3000 → なし",
            ...(!targetRested ? [] : [`自分.${serasN}.疲労: false → true`, "相手.標的.場所: フィールド → なし", `相手.トラッシュ: なし → ${aroku}`, "相手.リザーブ: 10 → 11"]),
            ...(expectChain ? [`自分.${name(KIGUNA)}.コア: 1 → 2`, `自分.${name(KIGUNA)}.Lv: 1 → 2`, `自分.${name(KIGUNA)}.BP: 1000 → 2000`] : []),
        ],
    })
}
zagna("057-疲労した相手を指定してアタック・白シンボルで機獣にコア", KIGUNA, true, true)
zagna("057-白シンボルがあっても機獣がいなければコアは置かれない", BERSERKER, true, false)
zagna("057-疲労していない相手は指定してアタックできない", KIGUNA, false, false)

// --- BS23-076 ----------------------------------------------------------------
console.log("=== 076: フラッシュ：相手のスピリットのコア1個を相手のリザーブへ（相手の緑がいればボイドへ）／白シンボルで白のスピリットにコア ===")
const vanish = name(VANISHING)
function vanishing(label: string, o: { ally?: string; oppSpirits: { card: string; cores: number; label?: string }[]; toVoid: boolean; soul?: boolean; chain: boolean }) {
    const cost = o.ally ? 4 : 5
    scenario({
        name: label,
        start: {
            interactive: true,
            me: { hand: [VANISHING], spirits: o.ally ? [{ card: o.ally }] : [] },
            opp: { spirits: o.oppSpirits, ...(o.soul ? { soulCore: "標的" } : {}) },
        },
        steps(t) {
            t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
            pickTarget(t)
        },
        expect: [
            `自分.手札: ${vanish} → なし`, `自分.トラッシュ: なし → ${vanish}`, `自分.リザーブ: 10 → ${10 - cost}`, `自分.トラッシュのコア: 0 → ${cost}`,
            "相手.標的.コア: 3 → 2", ...(o.toVoid ? [] : ["相手.リザーブ: 10 → 11"]),
            ...(o.chain ? [`自分.${name(KIGUNA)}.コア: 1 → 2`, `自分.${name(KIGUNA)}.Lv: 1 → 2`, `自分.${name(KIGUNA)}.BP: 1000 → 2000`] : []),
        ],
    })
}
const target3 = { card: ROKU, cores: 3, label: "標的" }
vanishing("076-相手のコアをリザーブへ・白シンボルで白のスピリットにコア", { ally: KIGUNA, oppSpirits: [target3], toVoid: false, chain: true })
vanishing("076-相手の緑のスピリットがいれば（標的が緑でなくても）ボイドへ", { oppSpirits: [target3, { card: BEETLE, cores: 2 }], toVoid: true, chain: false })
vanishing("076-白シンボルが無ければ連鎖は出ない", { oppSpirits: [target3], toVoid: false, chain: false })
vanishing("076-ソウルコアは動かず通常のコアがリザーブへ", { oppSpirits: [target3], toVoid: false, soul: true, chain: false })

// --- BS23-X02 ----------------------------------------------------------------
console.log("=== X02: 召喚時に相手のスピリットのコア3個をリザーブへ・0個になった1体につきボイドからコア1個 ===")
const viper = name(VIPER)
function viperSummon(label: string, oppCores: number, soul = false) {
    const zeroed = oppCores === 3
    scenario({
        name: label,
        start: { me: { reserve: 15, hand: [VIPER] }, opp: { spirits: [{ card: ROKU, label: "標的", cores: oppCores }], ...(soul ? { soulCore: "標的" } : {}) } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: [
            ...born(VIPER, 1, 1, 8000), `自分.手札: ${viper} → なし`, `自分.リザーブ: 15 → ${4 + (zeroed ? 1 : 0)}`, "自分.トラッシュのコア: 0 → 10",
            "相手.リザーブ: 10 → 13",
            ...(zeroed ? ["相手.標的.場所: フィールド → なし", `相手.トラッシュ: なし → ${aroku}`] : [`相手.標的.コア: ${oppCores} → ${oppCores - 3}`]),
        ],
    })
}
viperSummon("X02-コアが0個になった1体につきボイドからコア1個（破壊される）", 3)
viperSummon("X02-0個にならなければ自分はコアを得ない", 5)
scenario({
    name: "X02-ソウルコアは動かず通常のコア3個がリザーブへ",
    start: { me: { reserve: 15, hand: [VIPER] }, opp: { spirits: [{ card: ROKU, label: "標的", cores: 5 }], soulCore: "標的" } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...born(VIPER, 1, 1, 8000), `自分.手札: ${viper} → なし`, "自分.リザーブ: 15 → 4", "自分.トラッシュのコア: 0 → 10", "相手.リザーブ: 10 → 13", "相手.標的.コア: 5 → 2"],
})

console.log("=== X02: Lv2 以上のアタック時に相手のフィールドのコア1個をリザーブへ／Lv3 の【強化】で+1個 ===")
function viperAttack(label: string, cores: number, oppCores: number, removed: number) {
    scenario({
        name: label,
        start: { me: { spirits: [{ card: VIPER, cores }] }, opp: { spirits: [{ card: ROKU, label: "標的", cores: oppCores }] } },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(viper) })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [`自分.${viper}.疲労: false → true`, "相手.ライフ: 5 → 3", `相手.リザーブ: 10 → ${10 + 2 + removed}`,
            ...(removed === 0 ? [] : [`相手.標的.コア: ${oppCores} → ${oppCores - removed}`])],
    })
}
viperAttack("X02-Lv2 のアタック時に相手のコア1個", 3, 4, 1)
viperAttack("X02-Lv1 ではアタック時効果が無い", 1, 4, 0)
viperAttack("X02-Lv3 は強化で2個", 5, 5, 2)

// 強化の確認：スモッグゴートの召喚時（相手のスピリット上のコア1個→相手のリザーブ）に自分の X02 が与える数
function smogWith(label: string, cores: number, removed: number) {
    scenario({
        name: label,
        start: { interactive: true, me: { hand: [SMOG], spirits: [{ card: VIPER, cores }] }, opp: { spirits: [{ card: ROKU, label: "標的", cores: 5 }] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            pickTarget(t)
        },
        expect: [...born(SMOG, 1, 1, 1000), `自分.手札: ${name(SMOG)} → なし`, "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 1", `相手.標的.コア: 5 → ${5 - removed}`, `相手.リザーブ: 10 → ${10 + removed}`],
    })
}
smogWith("X02-Lv3 の強化でほかのコア除去も+1（計2個）", 5, 2)
smogWith("X02-Lv2 は強化を持たない（1個）", 3, 1)

// --- BS23-X08 ----------------------------------------------------------------
// 合体時BPはブレイヴのBP（5000）ぶん。スピリット状態では【強化】なし、直接合体なら召喚時の効果に自身の【強化】が乗る（Q20368・Q20369）
console.log("=== X08: 召喚時に相手のコア1個をリザーブへ・ドロー1／直接合体なら【強化】で+1個 ===")
const shion = name(SHION)
scenario({
    name: "X08-スピリット状態で召喚すると強化なし（1個）",
    start: { me: { hand: [SHION] }, opp: { spirits: [{ card: ROKU, label: "標的", cores: 5 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...born(SHION, 1, 1, 5000), "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 6", ...drew(shion), "相手.標的.コア: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "X08-直接合体で召喚すると自身の強化が乗る（2個）",
    start: { me: { hand: [SHION], spirits: [{ card: ALDEUS }] }, opp: { spirits: [{ card: ROKU, label: "標的", cores: 5 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id(name(ALDEUS)) }),
    expect: [
        `自分.${name(ALDEUS)}.BP: 4000 → 9000`, `自分.${shion}.場所: なし → 合体`, `自分.${shion}.疲労: なし → false`, `自分.${shion}.コア: なし → 0`, `自分.${shion}.Lv: なし → 1`,
        "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 5", ...drew(shion), "相手.標的.コア: 5 → 3", "相手.リザーブ: 10 → 12",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part856）")
