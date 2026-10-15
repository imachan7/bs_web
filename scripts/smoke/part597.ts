// smoke パート597（BS16-X03 【烈神速】× SD02-013 転召の祭壇）
// 【烈神速】の余分は割り振りの後に払う（2026-10-15 ユーザー確認。COST_MODEL §11）が、いまのカードプールで余分を課すのは
// 祭壇（コスト3以下だけ）だけで、【烈神速】持ちはコスト7のセイリュービだけ。なので「祭壇があっても余分は掛からない」を確かめる
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const SEI = "BS16-X03" // 烈の覇王セイリュービ（緑・コスト7・Lv1=1コア BP5000 / Lv2=3コア BP10000 / Lv3=6コア BP14000）
const ALTAR = "SD02-013" // 転召の祭壇
const ROKU = "BS01-002" // ロクケラトプス（3コアでLv3 BP4000、2コアでLv2 BP3000）

console.log("=== 前提: カードの機械確認 ===")
{
    const l = getCard(SEI).levels
    assert(getCard(SEI).name === "烈の覇王セイリュービ" && getCard(SEI).cost === 7, "SEIはセイリュービ・コスト7")
    assert(l[0]?.cores === 1 && l[0]?.bp === 5000 && l[1]?.cores === 3 && l[1]?.bp === 10000 && l[2]?.cores === 6, "SEIのLv1/2/3は1/3/6コア・BP5000/10000")
    assert(getCard(SEI).effects.some((e: any) => e.keyword === "resshinsoku"), "SEIは【烈神速】持ち")
    assert(getCard(ALTAR).name === "転召の祭壇" && getCard(ALTAR).type === "nexus", "ALTARは転召の祭壇")
    assert(getCard(ROKU).levels[2]?.cores === 3 && getCard(ROKU).levels[2]?.bp === 4000 && getCard(ROKU).levels[1]?.bp === 3000, "ROKUは3コア4000・2コア3000")
}

// 割り振りは option の文言で選ぶ。first＝最初の1回だけ「リザーブに置く」系を選ぶか
function drive(t: ScenarioCtx, opts: { firstToReserve?: boolean; pay?: { label: string; count: number } }): { sawDistribute: boolean; sawCostPay: boolean; prompts: string[] } {
    const seen = { sawDistribute: false, sawCostPay: false, prompts: [] as string[] }
    let first = true
    for (let i = 0; i < 12 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice as any
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.distributeCores) {
            seen.sawDistribute = true
            seen.prompts.push(`${pc.prompt} / ${(pc.options ?? []).join("|")}`)
            const options: string[] = pc.options ?? []
            let pick: string | undefined
            if (opts.firstToReserve && first) pick = options.find(o => o.includes("リザーブ") && !o.includes("全部"))
            else pick = options.find(o => o.includes("残り全部") && o.includes("このスピリット")) ?? options.find(o => o.includes("このスピリット"))
            first = false
            t.act(side, { type: "resolveChoice", option: pick ?? options[0] ?? "" })
        } else if (pc.effectCostPay) {
            seen.sawCostPay = true
            t.act(side, { type: "resolveChoice", option: pc.options?.[0], ...(opts.pay ? { paySources: [{ instanceId: t.id(opts.pay.label), count: opts.pay.count }] } : {}) })
        } else {
            t.act(side, { type: "resolveChoice", option: pc.options?.[0] })
        }
    }
    return seen
}

const SEI_ARRIVES = (cores: number, lv: number, bp: number) => [
    "自分.烈の覇王セイリュービ.場所: なし → フィールド",
    "自分.烈の覇王セイリュービ.疲労: なし → false",
    `自分.烈の覇王セイリュービ.コア: なし → ${cores}`,
    `自分.烈の覇王セイリュービ.Lv: なし → ${lv}`,
    `自分.烈の覇王セイリュービ.BP: なし → ${bp}`,
    "自分.手札: 烈の覇王セイリュービ → なし",
]
const OPP = { nexuses: [{ card: ALTAR, cores: 1 }], spirits: [{ card: "BS10-028", cores: 1 }] } // マタンゴル（アタック宣言でフラッシュの場を作る）
const OPPFATIGUE = "相手.マタンゴル.疲労: false → true"
const setTrash = (t: ScenarioCtx) => { t.state.players[t.me].trashCores = 5 }

console.log("=== 1. 対話：フィールドに使えるコアがあっても、割り振りの後に余分の支払い待ちは出ない ===")
scenario({
    name: "resshinsoku-field-pay",
    mirror: false,
    start: { turn: "opp", phase: "attack", interactive: true, me: { reserve: 3, hand: [SEI], spirits: [{ card: ROKU, cores: 3 }] }, opp: OPP },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("マタンゴル") })
        setTrash(t)
        t.act("me", { type: "resshinsokuSummon", handIndex: 0 })
        const r = drive(t, {})
        assert(r.sawDistribute, "コアの割り振りの待ちが出る")
        assert(!r.sawCostPay, "コスト7なので祭壇の余分の支払い待ちは出ない")
    },
    expect: [OPPFATIGUE, ...SEI_ARRIVES(5, 2, 10000)],
})

console.log("=== 2. 非対話：全部このスピリットに置き、余分は払わない ===")
scenario({
    name: "resshinsoku-auto",
    mirror: false,
    start: { turn: "opp", phase: "attack", me: { reserve: 1, hand: [SEI] }, opp: OPP },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("マタンゴル") })
        setTrash(t)
        t.act("me", { type: "resshinsokuSummon", handIndex: 0 })
    },
    expect: [OPPFATIGUE, ...SEI_ARRIVES(5, 2, 10000)],
})

console.log("すべてのチェックに合格しました 🎉（part597）")
