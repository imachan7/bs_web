// smoke パート854（BS23 紫バッチ：010 ウィングワインダー・011 アメジスネーク・012 狼騎士ルーガー・014 ボーン・セーラス・015 白騎竜ホワイト・ペンドラゴン。
// BS23_PLAN §1 の 068 Lv2 の行（Q4471）と効果文から。010 のコストを疲労で減らす操作の形は未決で、BS16-021 の肩代わりと同じ欄を仮置きしている）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const WINGWINDER = "BS23-010"
const AMETHYS = "BS23-011"
const RUGER = "BS23-012"
const SERAS = "BS23-014"
const PENDRAGON = "BS23-015"
const ALDEUS = "BS23-017" // シャドー・アルデウス（紫・コスト6・軽減紫3）
const VIPER = "BS23-X02" // 白蛇帝アルデウス・ヴァイパー（紫・コスト10）
const UNDERGROUND = "BS23-068" // 偽りの地下帝国（ネクサス。Lv2 で本来コスト10以上の紫スピリットをコスト6として扱う）
const ROKU = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・Lv1 BP1000／Lv2 2コア BP3000／Lv3 3コア BP4000）
const SMOG = "BS06-014" // スモッグゴート（紫・コスト1・軽減なし。召喚時：相手のスピリット上のコア1個を相手のリザーブへ。0個にはできない）
const KIGUNA = "BS07-029" // キグナ・スワン（白・機獣・コスト1・Lv1 BP1000）
const BERSERKER = "BS01-074" // バーサーカー・ガン（白・動器・コスト1）
const FANTASMA = "BS02-014" // ファンタズマ（紫・霊獣・コスト2・軽減紫）
const KING = "BS01-X03" // キングタウロス大公（緑・コスト8）
const HADES = "BS01-031" // デス・ハーデス（紫・コスト3・Lv1 BP4000／Lv2 4コア BP7000）
const PALD = "BS19-020" // 影の剣使いブラックパルド（紫・剣使・コスト5・軽減紫2・Lv1 BP3000）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, n: string, type: string, cost: number) =>
        assert(getCard(id).name === n && getCard(id).type === type && getCard(id).cost === cost, `${id} は ${n}（${type}・コスト${cost}）`)
    chk(WINGWINDER, "ウィングワインダー", "spirit", 2)
    chk(AMETHYS, "アメジスネーク", "spirit", 3)
    chk(RUGER, "狼騎士ルーガー", "spirit", 4)
    chk(SERAS, "ボーン・セーラス", "spirit", 4)
    chk(PENDRAGON, "白騎竜ホワイト・ペンドラゴン", "spirit", 5)
    chk(ALDEUS, "シャドー・アルデウス", "spirit", 6)
    chk(VIPER, "白蛇帝アルデウス・ヴァイパー", "spirit", 10)
    chk(UNDERGROUND, "偽りの地下帝国", "nexus", 3)
    chk(ROKU, "ロクケラトプス", "spirit", 1)
    chk(SMOG, "スモッグゴート", "spirit", 1)
    chk(KIGUNA, "キグナ・スワン", "spirit", 1)
    chk(BERSERKER, "バーサーカー・ガン", "spirit", 1)
    chk(FANTASMA, "ファンタズマ", "spirit", 2)
    chk(KING, "キングタウロス大公", "spirit", 8)
    chk(HADES, "デス・ハーデス", "spirit", 3)
    chk(PALD, "影の剣使いブラックパルド", "spirit", 5)
    assert(getCard(KIGUNA).family?.includes("機獣") === true && getCard(BERSERKER).family?.includes("機獣") !== true, "キグナは機獣・バーサーカー・ガンは違う")
    assert(getCard(PALD).family?.includes("剣使") === true && getCard(KING).colors.join() === "green", "パルドは剣使・キングは緑")
}

const name = (id: string) => getCard(id).name
const born = (id: string, cores: number, lv: number, bp: number, who = "自分") => [
    `${who}.${name(id)}.場所: なし → フィールド`, `${who}.${name(id)}.疲労: なし → false`, `${who}.${name(id)}.コア: なし → ${cores}`,
    `${who}.${name(id)}.Lv: なし → ${lv}`, `${who}.${name(id)}.BP: なし → ${bp}`,
]
const drew = (hand: string, n = 1) => [`自分.手札: ${hand} → ${Array(n).fill(name(ROKU)).join("、")}`, `自分.デッキ枚数: 40 → ${40 - n}`]

// --- BS23-010 ----------------------------------------------------------------
// 手札のカード名に「アルデウス」と入ったスピリットを召喚するとき、010 を疲労させてコスト-2。疲労させる操作の形は仮置き
console.log("=== 010: 疲労させて、アルデウスの召喚コストを-2する ===")
const wing = name(WINGWINDER)
const aldeusBorn = born(ALDEUS, 1, 1, 4000)
scenario({
    name: "010-疲労でアルデウスのコスト-2（自身の紫シンボルでさらに-1）",
    start: { me: { hand: [ALDEUS], spirits: [{ card: WINGWINDER }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [t.id(wing)] }),
    expect: [...aldeusBorn, `自分.${wing}.疲労: false → true`, "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 3", `自分.手札: ${name(ALDEUS)} → なし`],
})
scenario({
    name: "010-使わなければ軽減はシンボルの1だけ（任意）",
    start: { me: { hand: [ALDEUS], spirits: [{ card: WINGWINDER }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...aldeusBorn, "自分.リザーブ: 10 → 4", "自分.トラッシュのコア: 0 → 5", `自分.手札: ${name(ALDEUS)} → なし`],
})
scenario({
    name: "010-2体を疲労させるとコスト-4（重なる）",
    start: { me: { hand: [ALDEUS], spirits: [{ card: WINGWINDER, label: "A" }, { card: WINGWINDER, label: "B" }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [t.id("自分.A"), t.id("自分.B")] }),
    expect: [...aldeusBorn, "自分.A.疲労: false → true", "自分.B.疲労: false → true", "自分.リザーブ: 10 → 9", `自分.手札: ${name(ALDEUS)} → なし`],
})
scenario({
    name: "010-068 Lv2 のコスト6扱いと重なる（10→6、シンボル2、010で-2）",
    start: { me: { hand: [VIPER], spirits: [{ card: WINGWINDER }], nexuses: [{ card: UNDERGROUND, cores: 2 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [t.id(wing)] }),
    expect: [...born(VIPER, 1, 1, 8000), `自分.${wing}.疲労: false → true`, "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 2", `自分.手札: ${name(VIPER)} → なし`],
})
scenario({
    name: "010-アルデウスでないスピリットでは疲労で減らせない",
    start: { me: { hand: [FANTASMA], spirits: [{ card: WINGWINDER }] } },
    steps: (t) => t.actRejected("me", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [t.id(wing)] }),
    expect: [],
})

// --- BS23-011 ----------------------------------------------------------------
console.log("=== 011: 召喚時にドロー／Lv2 の【強化】でコア除去が+1個 ===")
scenario({
    name: "011-召喚時にドロー1",
    start: { me: { hand: [AMETHYS] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...born(AMETHYS, 1, 1, 1000), "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 3", ...drew(name(AMETHYS))],
})
// 強化の確認はスモッグゴートの召喚時（相手のスピリット上のコア1個→相手のリザーブ）で行う。相手の ROKU は5コア（Lv3 のまま）
const smog = name(SMOG)
type Sp = { card: string; cores: number; label?: string }
function smogCase(label: string, mine: Sp[], opp: Sp[], removed: number) {
    scenario({
        name: label,
        start: { interactive: true, me: { hand: [SMOG], spirits: mine }, opp: { spirits: [...opp, { card: ROKU, label: "標的", cores: 5 }] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            const target = t.id("標的")
            for (let i = 0; i < 3 && t.state.pendingChoice !== null; i++) {
                const pc = t.state.pendingChoice
                t.act(pc.pid === t.me ? "me" : "opp", pc.candidates.includes(target) ? { type: "resolveChoice", instanceId: target } : { type: "resolveChoice" })
            }
        },
        expect: [...born(SMOG, 1, 1, 1000), `自分.手札: ${smog} → なし`, "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 1",
            `相手.標的.コア: 5 → ${5 - removed}`, `相手.リザーブ: 10 → ${10 + removed}`],
    })
}
smogCase("011-Lv2 の強化でコア除去が+1（計2個）", [{ card: AMETHYS, cores: 4 }], [], 2)
smogCase("011-Lv1 は強化を持たない（1個）", [{ card: AMETHYS, cores: 1 }], [], 1)
smogCase("011-相手の011の強化は自分の効果に乗らない", [], [{ card: AMETHYS, cores: 4 }], 1)

// --- BS23-012 ----------------------------------------------------------------
console.log("=== 012: 召喚時にドロー／白シンボルがあればコスト4以下の相手のスピリットを手札に戻す ===")
const ruger = name(RUGER)
function rugerCase(label: string, mine: { card: string; cores: number }[], oppCard: string, reduce: number, bounced: boolean) {
    scenario({
        name: label,
        start: { me: { hand: [RUGER], spirits: mine }, opp: { spirits: [{ card: oppCard, label: "標的" }] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: [...born(RUGER, 1, 1, 2000), `自分.リザーブ: 10 → ${10 - (4 - reduce) - 1}`, `自分.トラッシュのコア: 0 → ${4 - reduce}`, ...drew(ruger),
            ...(bounced ? ["相手.標的.場所: フィールド → なし", `相手.手札: なし → ${name(oppCard)}`, "相手.リザーブ: 10 → 11"] : [])],
    })
}
rugerCase("012-白シンボルがあればコスト4以下を手札へ", [{ card: KIGUNA, cores: 1 }], ROKU, 1, true)
rugerCase("012-相手がコスト5以上なら戻せない", [{ card: KIGUNA, cores: 1 }], KING, 1, false)
rugerCase("012-白シンボルが無ければ戻さない", [{ card: FANTASMA, cores: 1 }], ROKU, 1, false)

// --- BS23-014 ----------------------------------------------------------------
// 破壊は相手のアタックをブロックして負ける形で起こす。相手の attacker は BP を上回るデス・ハーデス（BP4000／Lv2 は4コアで7000）
console.log("=== 014: Lv2以上の破壊時に剣使をトラッシュから召喚できる／赤シンボルがあればドロー ===")
const seras = name(SERAS)
function serasCase(label: string, cores: number, ally: string | null, trash: string[], summoned: boolean, drawn: boolean) {
    const attackerCores = cores === 1 ? 1 : 4
    const attackerBp = cores === 1 ? 4000 : 7000
    void attackerBp
    scenario({
        name: label,
        start: {
            turn: "opp", phase: "attack",
            me: { spirits: [{ card: SERAS, cores }, ...(ally ? [{ card: ally, cores: 1 }] : [])], trash },
            opp: { spirits: [{ card: HADES, label: "攻撃役", cores: attackerCores }] },
        },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id(seras) })
            t.closeFlash()
        },
        expect: [
            "相手.攻撃役.疲労: false → true", `自分.${seras}.場所: フィールド → なし`,
            `自分.リザーブ: 10 → ${10 + cores - (summoned ? 6 : 0)}`,
            `自分.トラッシュ: ${trash.map(name).join("、") || "なし"} → ${[seras, ...(summoned ? [] : trash.map(name))].join("、")}`,
            ...(summoned ? [...born(PALD, 1, 1, 3000), "自分.トラッシュのコア: 0 → 5"] : []),
            ...(drawn ? drew("なし") : []),
        ],
    })
}
serasCase("014-Lv2 の破壊時に剣使を召喚・赤シンボルで連鎖のドロー", 3, ROKU, [PALD], true, true)
serasCase("014-トラッシュに剣使がいなくても連鎖は出る", 3, ROKU, [], false, true)
serasCase("014-赤シンボルが無ければ連鎖は出ない（召喚は出る）", 3, null, [PALD], true, false)
serasCase("014-Lv1 は破壊時効果を持たない", 1, ROKU, [PALD], false, false)

// --- BS23-015 ----------------------------------------------------------------
console.log("=== 015: Lv1から【強化】（コア除去+1個）／ほかの強化と重なる ===")
smogCase("015-Lv1 から強化（計2個）", [{ card: PENDRAGON, cores: 1 }], [], 2)
smogCase("015-相手の015の強化は乗らない", [], [{ card: PENDRAGON, cores: 1 }], 1)
smogCase("015-011 Lv2 と重なって+2個（計3個）", [{ card: PENDRAGON, cores: 1 }, { card: AMETHYS, cores: 4 }], [], 3)

console.log("すべてのチェックに合格しました 🎉（part854）")
