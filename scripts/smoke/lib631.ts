// #631 の場面テスト用の道具（part1014〜1016 が使う）。staging のカードは実装前は data に無いので、無ければ節を飛ばす
import { assert, getCard } from "./helpers"
import type { ScenarioCtx, Side } from "./scenario"

export const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1 BP1000／Lv2(コア2) 3000／Lv3(コア3) 4000）
export const nm = (...names: string[]): string => [...names].sort().join("、") || "なし"
export const nmOf = (...ids: string[]): string => nm(...ids.map((i) => getCard(i).name))

// data に入っていれば名前・種類・コストを確かめて true。まだなら（未実装）と出して false（実装後に全部走る）
export function check(id: string, name: string, type: string, cost: number): boolean {
    let c: ReturnType<typeof getCard> | undefined
    try {
        c = getCard(id)
    } catch {
        c = undefined
    }
    if (!c) {
        console.log(`（未実装）${id} ${name}`)
        return false
    }
    assert(c.name === name && c.type === type && c.cost === cost, `${id}は${name}（${type}・コスト${cost}）`)
    return true
}
// 前提の確認だけ（既存カード）
export function fix(id: string, name: string, type: string, cost: number): void {
    assert(getCard(id).name === name && getCard(id).type === type && getCard(id).cost === cost, `${id}は${name}（${type}・コスト${cost}）`)
}

const NO = ["いいえ", "しない", "わない", "断る", "使わない"]
// 選択待ちが残っているあいだ答える。accept=false なら確認は断る。"noPay" はバーストの「その後コストを支払うことで」だけ断る。対象は prefer の先頭から候補にあるものを選ぶ
export function resolveAll(t: ScenarioCtx, prefer: string[] = [], accept: boolean | "noPay" = true): void {
    for (let i = 0; i < 30 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side: Side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "target" && accept === false && pc.optional) {
            t.act(side, { type: "resolveChoice" })
        } else if (pc.kind === "target") {
            const ids = prefer.flatMap((l) => {
                try {
                    return [t.id(l)]
                } catch {
                    return []
                }
            })
            t.act(side, { type: "resolveChoice", instanceId: ids.find((id) => pc.candidates.includes(id)) ?? pc.candidates[0]! })
        } else if (pc.kind === "option") {
            const opts = pc.options!
            const isNo = (o: string) => NO.some((w) => o.includes(w))
            const yes = accept === "noPay" ? !pc.burstThenPay : accept
            const pick = yes ? opts.find((o) => !isNo(o)) : opts.find(isNo)
            if (pick === undefined && !yes) t.act(side, { type: "resolveChoice" })
            else t.act(side, { type: "resolveChoice", option: pick ?? opts[0]! })
        } else if (accept === false && pc.optional && pc.cardZone === "deck") {
            t.act(side, { type: "resolveChoice" })
        } else {
            const zone = pc.cardZone === "reveal" ? t.state.revealedCards!.cardIds : pc.cardZone === "deck" ? t.state.players[pc.cardOwner!].deck : pc.cardZone === "trash" ? t.state.players[pc.cardOwner!].trashCards : t.state.players[pc.cardOwner!].hand
            const idx = pc.cardIndices!.find((i) => prefer.includes(getCard(zone[i]!).name))
            t.act(side, { type: "resolveChoice", cardIndex: idx ?? pc.cardIndices![0]! })
        }
    }
}

type Who = "自分" | "相手"
// マジックを使った行（手札に他のカードが無いとき。トラッシュは空から）
export const magicOut = (who: Who, name: string, cost: number, hand: string[] = [name]): string[] => {
    const rest = [...hand]
    rest.splice(rest.indexOf(name), 1)
    return [`${who}.手札: ${nm(...hand)} → ${nm(...rest)}`, `${who}.トラッシュ: なし → ${name}`, `${who}.リザーブ: 10 → ${10 - cost}`, `${who}.トラッシュのコア: 0 → ${cost}`]
}
// 召喚で場に出た個体の行（Lv1・コア1個・回復状態）。ラベルは「自分.名前」
export const born = (who: Who, name: string, bp: number): string[] => [
    `${who}.${name}.場所: なし → フィールド`, `${who}.${name}.疲労: なし → false`, `${who}.${name}.コア: なし → 1`, `${who}.${name}.Lv: なし → 1`, `${who}.${name}.BP: なし → ${bp}`,
]
// 手札からコストを払って召喚した行（コストをトラッシュへ・Lv1のコア1個をリザーブから）
export const summonOut = (who: Who, name: string, cost: number, bp: number, hand: string[] = [name]): string[] => {
    const rest = [...hand]
    rest.splice(rest.indexOf(name), 1)
    return [`${who}.手札: ${nm(...hand)} → ${nm(...rest)}`, `${who}.リザーブ: 10 → ${10 - cost - 1}`, `${who}.トラッシュのコア: 0 → ${cost}`, ...born(who, name, bp)]
}
