// smoke パート846（BS23 B5：X06 の「バーストのコストを払わなければ発動できない」節と、072 戒めの天空の祠の「他の効果ではコアを置けない」「剣刃のブレイヴが召喚されたときコアが載る」節。BS23_PLAN §1・Q4617〜Q4621・Q22556〜Q22558。実装前に書いた期待値テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

const X06 = "BS23-X06"
const DORAT = "BS20-046" // ドラットフィッシュ（青・異合・シンボル青1・効果なし）
const RAIGEKI = "BS15-078" // 飛雷震之計（緑・マジック・コスト5・軽減緑2。【バースト：相手のスピリットのアタック後】）
const BEETLE = "BS01-050" // ビートビートル（緑・コスト0・シンボル緑1・効果なし）
const HOKORA = "BS23-072" // 戒めの天空の祠（青・ネクサス・コスト4・軽減青2・シンボル青1・Lvコア0/5）
const USUBA = "BS19-X07" // 黒蟲の妖刀ウスバカゲロウ（緑・剣刃のブレイヴ・コスト5・軽減緑3）
const SHITORI = "BS21-057" // 冥獣騎シトリー（紫・剣刃でないブレイヴ・コスト3・軽減紫2）
const KAMOONE = "BS20-049" // カモオネ（青・異合・コスト4・Lv1 アタック時ボイドからコア1個を自分のネクサスに置く）
const FLAG = "BS10-096" // 最後の優勝旗（青・ネクサス・コスト5。072 と違いコアを置ける対照）
const SHIN = "BS23-X07" // 真・裁きの神剣トゥルース・エデン（剣刃のブレイヴ・コスト6・召喚時に手札の剣刃ブレイヴをコストなしで召喚）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(RAIGEKI).name === "飛雷震之計" && getCard(RAIGEKI).type === "magic" && getCard(RAIGEKI).cost === 5 && getCard(RAIGEKI).reduction.join() === "green,green", "RAIGEKIは飛雷震之計（コスト5・軽減緑2）")
    assert(getCard(RAIGEKI).effect.includes("【バースト：相手のスピリットのアタック後】"), "RAIGEKIは相手のスピリットのアタック後バースト")
    assert(getCard(BEETLE).name === "ビートビートル" && getCard(BEETLE).effect === "", "BEETLEは効果なし")
    assert(getCard(HOKORA).name === "戒めの天空の祠" && getCard(HOKORA).type === "nexus" && getCard(HOKORA).cost === 4, "HOKORAは戒めの天空の祠")
    assert(getCard(USUBA).name === "黒蟲の妖刀ウスバカゲロウ" && getCard(USUBA).family.includes("剣刃") && getCard(USUBA).cost === 5 && getCard(USUBA).reduction.join() === "green,green,green", "USUBAは剣刃・コスト5・軽減緑3")
    assert(getCard(SHITORI).name === "冥獣騎シトリー" && !getCard(SHITORI).family.includes("剣刃") && getCard(SHITORI).type === "brave" && getCard(SHITORI).cost === 3, "SHITORIは剣刃でないブレイヴ・コスト3")
    assert(getCard(KAMOONE).name === "カモオネ" && getCard(KAMOONE).effect.includes("自分のネクサスに置く"), "KAMOONEは自分のネクサスにコアを置く")
    assert(getCard(FLAG).name === "最後の優勝旗" && getCard(FLAG).type === "nexus", "FLAGは最後の優勝旗")
    assert(getCard(SHIN).name === "真・裁きの神剣トゥルース・エデン" && getCard(SHIN).family.includes("剣刃"), "SHINは剣刃")
}

// バーストの発動確認は受けて、解決後の追加支払いの確認などは断る。X06 の確認が出ない場面ではそのまま通る
function drain(t: ScenarioCtx, side: Side = "opp"): void {
    for (let i = 0; i < 10 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice as { burstActivate?: unknown; cardIndices?: number[]; candidates?: string[]; pid?: string }
        const who = pc.pid === t.state.turnPlayer ? "me" : "opp"
        void side
        if (pc.burstActivate !== undefined) t.act(who, { type: "resolveChoice", option: "発動する" })
        else if (pc.cardIndices?.[0] !== undefined) t.act(who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else if (pc.candidates?.[0] !== undefined) t.act(who, { type: "resolveChoice", instanceId: pc.candidates[0] })
        else t.act(who, { type: "resolveChoice" })
    }
}

function attackAndTakeLife(t: ScenarioCtx, attacker: string): void {
    t.act("me", { type: "attack", instanceId: t.id(attacker) })
    drain(t)
    t.closeFlash()
    drain(t)
    t.act("opp", { type: "takeLife" })
    drain(t)
}

console.log("=== 節2: 払えるときはコスト5を発動宣言時に払って発動する。払ったコアはトラッシュへ ===")
// X06 は異合で手札の無い相手にブロックされず、シンボル2つ分（ライフ2）受ける。リザーブ5→0、ライフから+2
scenario({
    name: "x06-burst-pay",
    start: {
        me: { spirits: [{ card: X06, label: "ハスターク" }] },
        opp: { reserve: 5, burst: RAIGEKI },
        phase: "attack",
        interactive: true,
    },
    steps: (t) => attackAndTakeLife(t, "ハスターク"),
    expect: [
        "自分.ハスターク.疲労: false → true",
        "相手.バースト: 飛雷震之計 → なし",
        "相手.トラッシュ: なし → 飛雷震之計",
        "相手.トラッシュのコア: 0 → 5",
        "相手.リザーブ: 5 → 2",
        "相手.ライフ: 5 → 3",
    ],
})

console.log("=== 節2: 相手のフィールドのシンボルで軽減できる（Q4618）。緑2つでコスト3 ===")
scenario({
    name: "x06-burst-pay-reduced",
    start: {
        me: { spirits: [{ card: X06, label: "ハスターク" }] },
        opp: { reserve: 3, burst: RAIGEKI, spirits: [{ card: BEETLE, label: "緑1" }, { card: BEETLE, label: "緑2" }] },
        phase: "attack",
        interactive: true,
    },
    steps: (t) => attackAndTakeLife(t, "ハスターク"),
    expect: [
        "自分.ハスターク.疲労: false → true",
        "相手.バースト: 飛雷震之計 → なし",
        "相手.トラッシュ: なし → 飛雷震之計",
        "相手.トラッシュのコア: 0 → 3",
        "相手.リザーブ: 3 → 2",
        "相手.ライフ: 5 → 3",
    ],
})

console.log("=== 節2: コアが足りなければ発動できず、バーストはセットされたまま（Q4619。軽減なしでコスト5に対しリザーブ4） ===")
scenario({
    name: "x06-burst-cannot-pay",
    start: {
        me: { spirits: [{ card: X06, label: "ハスターク" }] },
        opp: { reserve: 4, burst: RAIGEKI },
        phase: "attack",
        interactive: true,
    },
    steps: (t) => attackAndTakeLife(t, "ハスターク"),
    expect: ["自分.ハスターク.疲労: false → true", "相手.リザーブ: 4 → 6", "相手.ライフ: 5 → 3"],
})

console.log("=== 節2: X06 がいなければコストなしで発動する（対照。異合のドラットフィッシュのアタック） ===")
scenario({
    name: "x06-burst-free-without",
    start: {
        me: { spirits: [{ card: DORAT, label: "異合兵" }] },
        opp: { reserve: 4, burst: RAIGEKI },
        phase: "attack",
        interactive: true,
    },
    steps: (t) => attackAndTakeLife(t, "異合兵"),
    expect: [
        "自分.異合兵.疲労: false → true",
        "相手.バースト: 飛雷震之計 → なし",
        "相手.トラッシュ: なし → 飛雷震之計",
        "相手.リザーブ: 4 → 5",
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== 072: このネクサス自身の効果以外ではコアを置けない（メインステップの moveCore は拒否。対照の最後の優勝旗には置ける） ===")
scenario({
    name: "hokora-movecore-rejected",
    start: { me: { nexuses: [{ card: HOKORA, label: "祠", cores: 0 }] } },
    steps: (t) => t.actRejected("me", { type: "moveCore", instanceId: t.id("祠"), direction: "add" }),
    expect: [],
})
scenario({
    name: "flag-movecore-control",
    start: { me: { nexuses: [{ card: FLAG, label: "旗", cores: 1 }] } },
    steps: (t) => t.act("me", { type: "moveCore", instanceId: t.id("旗"), direction: "add" }),
    expect: ["自分.旗.コア: 1 → 2", "自分.リザーブ: 10 → 9"],
})

console.log("=== 072: ボイドからコアを置く他の効果（カモオネのアタック時）でも置けない。対照の優勝旗には置ける ===")
for (const [label, nex, cores, gain] of [["祠", HOKORA, 0, 0], ["旗", FLAG, 1, 1]] as const) {
    scenario({
        name: `kamoone-core-${label}`,
        start: { me: { spirits: [{ card: KAMOONE, label: "カモオネ" }], nexuses: [{ card: nex, label, cores }] }, phase: "attack" },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("カモオネ") })
            drain(t)
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.カモオネ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", ...(gain ? [`自分.${label}.コア: ${cores} → ${cores + gain}`] : [])],
    })
}

console.log("=== 072: 配置時にもコアを置かない（手札から配置するとコア0個のまま） ===")
scenario({
    name: "hokora-place",
    start: { me: { hand: [HOKORA] } },
    steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
    expect: [
        "自分.手札: 戒めの天空の祠 → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.戒めの天空の祠.場所: なし → ネクサス",
        "自分.戒めの天空の祠.疲労: なし → false",
        "自分.戒めの天空の祠.コア: なし → 0",
        "自分.戒めの天空の祠.Lv: なし → 1",
    ],
})

console.log("=== 072 Lv1: 剣刃のブレイヴがコストを払って召喚されたとき、ボイドからコア1個を祠に置く ===")
// ウスバカゲロウはコスト5（軽減は緑で祠の青では減らない）。リザーブ10→5、Lv1 のコア1個で→4
scenario({
    name: "hokora-sword-summon",
    start: { me: { hand: [USUBA], nexuses: [{ card: HOKORA, label: "祠", cores: 0 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 黒蟲の妖刀ウスバカゲロウ → なし",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.黒蟲の妖刀ウスバカゲロウ.場所: なし → フィールド",
        "自分.黒蟲の妖刀ウスバカゲロウ.疲労: なし → false",
        "自分.黒蟲の妖刀ウスバカゲロウ.コア: なし → 1",
        "自分.黒蟲の妖刀ウスバカゲロウ.Lv: なし → 1",
        "自分.黒蟲の妖刀ウスバカゲロウ.BP: なし → 5000",
        "自分.祠.コア: 0 → 1",
    ],
})

console.log("=== 072 Lv1: ソウルコアが祠に載っていても、置かれるのは新しいコア1個でソウルコアは動かない ===")
scenario({
    name: "hokora-sword-summon-soul",
    start: { me: { hand: [USUBA], nexuses: [{ card: HOKORA, label: "祠", cores: 1 }], soulCore: "祠" } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 黒蟲の妖刀ウスバカゲロウ → なし",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.黒蟲の妖刀ウスバカゲロウ.場所: なし → フィールド",
        "自分.黒蟲の妖刀ウスバカゲロウ.疲労: なし → false",
        "自分.黒蟲の妖刀ウスバカゲロウ.コア: なし → 1",
        "自分.黒蟲の妖刀ウスバカゲロウ.Lv: なし → 1",
        "自分.黒蟲の妖刀ウスバカゲロウ.BP: なし → 5000",
        "自分.祠.コア: 1 → 2",
    ],
})

console.log("=== 072 Lv1: 剣刃でないブレイヴでは置かない ===")
scenario({
    name: "hokora-nonsword-summon",
    start: { me: { hand: [SHITORI], nexuses: [{ card: HOKORA, label: "祠", cores: 0 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 冥獣騎シトリー → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.冥獣騎シトリー.場所: なし → フィールド",
        "自分.冥獣騎シトリー.疲労: なし → false",
        "自分.冥獣騎シトリー.コア: なし → 1",
        "自分.冥獣騎シトリー.Lv: なし → 1",
        "自分.冥獣騎シトリー.BP: なし → 2000",
    ],
})

console.log("=== 072 Lv1: 相手の剣刃のブレイヴの召喚では置かない（相手のターン） ===")
scenario({
    name: "hokora-opp-sword-summon",
    start: { turn: "opp", me: { nexuses: [{ card: HOKORA, label: "祠", cores: 0 }] }, opp: { hand: [USUBA] } },
    steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
    expect: [
        "相手.手札: 黒蟲の妖刀ウスバカゲロウ → なし",
        "相手.リザーブ: 10 → 4",
        "相手.トラッシュのコア: 0 → 5",
        "相手.黒蟲の妖刀ウスバカゲロウ.場所: なし → フィールド",
        "相手.黒蟲の妖刀ウスバカゲロウ.疲労: なし → false",
        "相手.黒蟲の妖刀ウスバカゲロウ.コア: なし → 1",
        "相手.黒蟲の妖刀ウスバカゲロウ.Lv: なし → 1",
        "相手.黒蟲の妖刀ウスバカゲロウ.BP: なし → 5000",
    ],
})

console.log("=== 072 Lv1: コストを支払わない召喚では置かない（トゥルース・エデンが召喚時に呼ぶウスバカゲロウ分は数えない） ===")
// トゥルース・エデンはコスト6（軽減に青があり祠の青シンボルで1減ってコスト5）。払って召喚されるので祠は+1。無償のウスバカゲロウでは増えない
scenario({
    name: "hokora-free-summon",
    start: { me: { hand: [SHIN, USUBA], nexuses: [{ card: HOKORA, label: "祠", cores: 0 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        drain(t, "me")
    },
    expect: [
        "自分.手札: 真・裁きの神剣トゥルース・エデン、黒蟲の妖刀ウスバカゲロウ → なし",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 5",
        "自分.真・裁きの神剣トゥルース・エデン.場所: なし → フィールド",
        "自分.真・裁きの神剣トゥルース・エデン.疲労: なし → false",
        "自分.真・裁きの神剣トゥルース・エデン.コア: なし → 1",
        "自分.真・裁きの神剣トゥルース・エデン.Lv: なし → 1",
        "自分.真・裁きの神剣トゥルース・エデン.BP: なし → 10000",
        "自分.黒蟲の妖刀ウスバカゲロウ.場所: なし → フィールド",
        "自分.黒蟲の妖刀ウスバカゲロウ.疲労: なし → false",
        "自分.黒蟲の妖刀ウスバカゲロウ.コア: なし → 1",
        "自分.黒蟲の妖刀ウスバカゲロウ.Lv: なし → 1",
        "自分.黒蟲の妖刀ウスバカゲロウ.BP: なし → 5000",
        "自分.祠.コア: 0 → 1",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part846）")
