// smoke パート772（召喚したスピリットの『召喚時』と「スピリットが召喚されたとき」は同時発揮。解決順はターンプレイヤーが選ぶ。2026-11-05 ユーザー確認）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const MOMO = "BS06-087" // 夢中漂う桃幻郷：Lv1『自分のメインステップ』想獣が召喚されたとき1枚ドロー
const MINO = "BS13-034" // ミノガメン：想獣・コスト2『召喚時』デッキ上1枚オープン、コスト2のスピリットなら手札に
const NEKO = "BS15-040" // ネコマーダ：想獣・コスト3『召喚時』手札1枚を破棄することで1枚ドロー
const VANILLA = "BS01-002" // ロクケラトプス（効果なし・想獣でない）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(MOMO).name === "夢中漂う桃幻郷" && getCard(MOMO).type === "nexus" && getCard(MOMO).levels[0]!.cores === 0, "MOMOは夢中漂う桃幻郷（ネクサス・Lv1はコア0）")
    assert(getCard(MINO).name === "ミノガメン" && getCard(MINO).cost === 2 && getCard(MINO).levels[0]!.cores === 1 && getCard(MINO).family.includes("想獣"), "MINOはミノガメン（コスト2・Lv1はコア1・想獣）")
    assert(getCard(NEKO).name === "ネコマーダ" && getCard(NEKO).cost === 3 && getCard(NEKO).levels[0]!.cores === 1 && getCard(NEKO).family.includes("想獣"), "NEKOはネコマーダ（コスト3・Lv1はコア1・想獣）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).effect === "" && !getCard(VANILLA).family.includes("想獣"), "VANILLAはロクケラトプス（効果なし・想獣でない）")
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = []
    s.players.p2.hand = []
    return s
}

function answer(s: GameState, pick: (options: string[]) => string | undefined, target?: (c: string[]) => string | undefined): string[] {
    const prompts: string[] = []
    for (let i = 0; i < 10 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        prompts.push(pc.prompt)
        const res: Record<string, unknown> = { type: "resolveChoice" }
        if (pc.kind === "option") res["option"] = pick(pc.options ?? []) ?? pc.options![0]
        else if (pc.kind === "target") res["instanceId"] = target?.(pc.candidates ?? []) ?? pc.candidates![0]
        else res["cardIndex"] = pc.cardIndices?.[0]
        if (handleAction(s, pc.pid as PlayerId, res as never) !== null) break
    }
    return prompts
}

function summonMino(s: GameState): void {
    s.players.p1.hand.push(MINO)
    refreshLevelAsOverrides(s)
    assert(handleAction(s, "p1", { type: "summon", handIndex: s.players.p1.hand.length - 1 }) === null, "ミノガメンを手札から召喚できる")
}

console.log("=== A（規則1）: ミノガメンの『召喚時』と桃幻郷の「召喚されたとき」が1つの同時発揮で、ターンプレイヤーが解決順を選ぶ ===")
{
    const s = game("part772-A", true)
    s.players.p1.field.nexuses.push(createInstance(MOMO, s.turn, 0))
    s.players.p1.deck = [MINO, MOMO, ...Array.from({ length: 38 }, () => VANILLA)] // 上から X=ミノガメン（コスト2のスピリット）、Y=桃幻郷（コスト2のスピリットでない）
    summonMino(s)
    const pc = s.pendingChoice
    assert(pc?.triggerOrder !== undefined, `解決順の確認が立つ（${pc?.prompt ?? "null"}）`)
    assert(pc?.pid === "p1", "選ぶのはターンプレイヤー")
    const options = pc?.options ?? []
    assert(options.some((o) => o.includes("ミノガメン")) && options.some((o) => o.includes("桃幻郷")), `候補にミノガメンと桃幻郷の両方がある（${options.join(" / ")}）`)
    answer(s, (o) => o[0])
}

console.log("=== B（規則1）: 順1 ミノガメンを先 → Xを手札に加え、桃幻郷でYをドロー。手札はXとY、デッキの上は3枚目 ===")
{
    const s = game("part772-B1", true)
    s.players.p1.field.nexuses.push(createInstance(MOMO, s.turn, 0))
    s.players.p1.deck = [MINO, MOMO, ...Array.from({ length: 38 }, () => VANILLA)]
    summonMino(s)
    answer(s, (o) => o.find((x) => x.includes("ミノガメン")) ?? o[0])
    assert(s.pendingChoice === null, "列が残らず解決し終える")
    assert(s.players.p1.hand.length === 2 && s.players.p1.hand.includes(MINO) && s.players.p1.hand.includes(MOMO), `手札にX（ミノガメン）とY（桃幻郷）がある（${s.players.p1.hand.join(" / ")}）`)
    assert(s.players.p1.deck[0] === VANILLA, "デッキの上は3枚目のロクケラトプス")
}

console.log("=== B（規則1）: 順2 桃幻郷を先 → Xをドローし、ミノガメンはYをオープンしてデッキの上に戻す。手札はXだけ ===")
{
    const s = game("part772-B2", true)
    s.players.p1.field.nexuses.push(createInstance(MOMO, s.turn, 0))
    s.players.p1.deck = [MINO, MOMO, ...Array.from({ length: 38 }, () => VANILLA)]
    summonMino(s)
    answer(s, (o) => o.find((x) => x.includes("桃幻郷")) ?? o[0])
    assert(s.pendingChoice === null, "列が残らず解決し終える")
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === MINO, `手札はX（ミノガメン）だけ（${s.players.p1.hand.join(" / ")}）`)
    assert(s.players.p1.deck[0] === MOMO, "デッキの上はY（桃幻郷）に戻っている")
}

console.log("=== C（規則2）: ネコマーダの「破棄することで」で止まっても、答えたあと桃幻郷のドローも解決する ===")
{
    const s = game("part772-C", true)
    s.players.p1.field.nexuses.push(createInstance(MOMO, s.turn, 0))
    s.players.p1.hand.push(NEKO, VANILLA)
    refreshLevelAsOverrides(s)
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "ネコマーダを手札から召喚できる")
    const pc = s.pendingChoice
    assert(pc?.triggerOrder !== undefined, "解決順の確認が立つ")
    const prompts = answer(s, (o) => o.find((x) => x.includes("ネコマーダ")) ?? o[0])
    assert(prompts.some((p) => p.includes("ネコマーダ")), `ネコマーダの発動確認で止まる（${prompts.join(" / ")}）`)
    assert(s.players.p1.hand.length === 2, `破棄1枚・ネコマーダのドロー1枚・桃幻郷のドロー1枚で手札は2枚（${s.players.p1.hand.length}）`)
}

console.log("=== D（規則3）: 誘発が1枚だけなら解決順の確認が出ない ===")
{
    const s = game("part772-D1", true)
    s.players.p1.field.nexuses.push(createInstance(MOMO, s.turn, 0))
    s.players.p1.hand.push(VANILLA)
    refreshLevelAsOverrides(s)
    const hand = s.players.p1.hand.length
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "ロクケラトプス（想獣でない・効果なし）を召喚できる")
    assert(s.pendingChoice === null, `解決順の確認は出ない（${s.pendingChoice?.prompt ?? "null"}）`)
    assert(s.players.p1.hand.length === hand - 1, "想獣でないので桃幻郷は誘発せず、手札は減るだけ")
}
{
    const s = game("part772-D2", true)
    s.players.p1.deck = [MINO, ...Array.from({ length: 39 }, () => VANILLA)]
    summonMino(s)
    assert(s.pendingChoice === null, `桃幻郷がなければ解決順の確認は出ない（${s.pendingChoice?.prompt ?? "null"}）`)
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === MINO, "ミノガメン単体の『召喚時』だけ解決する")
}

console.log("=== E（規則4）: 非対話では解決順を聞かず、召喚時が先に解決する（順1と同じ結果） ===")
{
    const s = game("part772-E", false)
    s.players.p1.field.nexuses.push(createInstance(MOMO, s.turn, 0))
    s.players.p1.deck = [MINO, MOMO, ...Array.from({ length: 38 }, () => VANILLA)]
    summonMino(s)
    assert(s.pendingChoice === null, `解決順の確認は出ない（${s.pendingChoice?.prompt ?? "null"}）`)
    assert(s.players.p1.hand.length === 2 && s.players.p1.hand.includes(MINO) && s.players.p1.hand.includes(MOMO), `召喚時が先の結果：手札にXとY（${s.players.p1.hand.join(" / ")}）`)
    assert(s.players.p1.deck[0] === VANILLA, "デッキの上は3枚目")
}

console.log("すべてのチェックに合格しました 🎉（part772）")
