// smoke パート894（デッキからオープンして配置したネクサスも『このネクサスの配置時』を発揮する。2026-11-11 発見）
import { act, assert, createGame, getCard } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const LAMP = "BS12-083" // マジックランプ（マジック・デッキ上3枚からネクサス1枚を無償で配置）
const FORT = "BS09-066" // 目覚める要塞城（青ネクサス・配置時：手札のコスト4以下の青スピリットを無償召喚できる）
const GATE = "BS16-062" // 天下眺める絶景門（配置時は「手札から配置したとき」限定）
const BLUE = "BS03-071" // 戦闘獣ブルトップ（青・コスト0・バニラ）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(LAMP).name === "マジックランプ" && getCard(LAMP).type === "magic", "LAMPはマジックランプ")
    assert(getCard(FORT).name === "目覚める要塞城" && getCard(FORT).type === "nexus", "FORTは目覚める要塞城")
    assert(getCard(GATE).name === "天下眺める絶景門" && getCard(GATE).effect.includes("手札から配置したとき"), "GATEは絶景門（手札から配置したとき）")
    assert(getCard(BLUE).name === "戦闘獣ブルトップ" && getCard(BLUE).colors[0] === "blue" && getCard(BLUE).cost <= 4, "BLUEは青・コスト4以下")
}

function game(seed: string, top: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = interactive
    const p = s.players.p1
    p.reserve = 20
    p.hand = [LAMP, BLUE]
    p.deck = [top, VAN, VAN, ...Array.from({ length: 30 }, () => VAN)]
    p.field.spirits = []
    p.field.nexuses = []
    return s
}

const names = (s: GameState, pid: PlayerId, zone: "spirits" | "nexuses") => s.players[pid].field[zone].map((x) => getCard(x.cardId).name)

console.log("=== 1. 非対話：要塞城の配置時効果で手札の青スピリットが出る ===")
{
    const s = game("lamp-fort", FORT, false)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "マジックランプを使える")
    assert(names(s, "p1", "nexuses").includes("目覚める要塞城"), "要塞城が配置される")
    assert(names(s, "p1", "spirits").includes("戦闘獣ブルトップ"), "配置時効果でブルトップが召喚される")
    assert(s.players.p1.trashCards.filter((c) => c === VAN).length === 2, "残り2枚はトラッシュへ")
}

console.log("=== 2. 対話：配置時効果の確認・選択をはさんでも、残りのカードは片付く ===")
{
    const s = game("lamp-fort-i", FORT, true)
    act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" })
    for (let i = 0; i < 10 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        if (pc.options?.length) act(s, pc.pid, { type: "resolveChoice", option: pc.options[0]! })
        else if (pc.cardIndices?.length) act(s, pc.pid, { type: "resolveChoice", cardIndex: pc.cardIndices[0]! })
        else if (pc.candidates?.length) act(s, pc.pid, { type: "resolveChoice", instanceId: pc.candidates[0]! })
        else act(s, pc.pid, { type: "resolveChoice" })
    }
    assert(!s.pendingChoice, "選択待ちが残らない")
    assert(names(s, "p1", "nexuses").includes("目覚める要塞城"), "要塞城が配置される")
    assert(names(s, "p1", "spirits").includes("戦闘獣ブルトップ"), "配置時効果でブルトップが召喚される")
    assert(s.players.p1.trashCards.filter((c) => c === VAN).length === 2, "残り2枚はトラッシュへ")
}

console.log("=== 3. 「手札から配置したとき」限定の配置時効果は、デッキからの配置では発揮しない ===")
{
    const s = game("lamp-gate", GATE, false)
    s.players.p2.field.spirits = []
    act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" })
    assert(names(s, "p1", "nexuses").includes("天下眺める絶景門"), "絶景門が配置される")
    assert(s.log.every((l) => !String(typeof l === "string" ? l : (l as { text?: string }).text).includes("BP5000以下")), "配置時効果は出ない")
}

console.log("すべてのチェックに合格しました 🎉（part894）")
