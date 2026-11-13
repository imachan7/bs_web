// AI戦の Worker（public/dist/aiWorker.js）を束ね、束ねたものが Node 無しで動くかを確かめる。
// エンジンのうちファイルを読む2つ（data/loadCards・coverageRecorder）だけを public/src/aiWorker/ の同名ファイルに差し替える。
// エンジンに Node 専用の import や process の参照を足すと、ここで落ちる
import { build } from "esbuild"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import vm from "node:vm"

const root = path.resolve(import.meta.dirname, "..")
const shim = (name) => path.join(root, "public/src/aiWorker", name)
const outfile = path.join(root, "public/dist/aiWorker.js")

await build({
    entryPoints: [shim("worker.ts")],
    bundle: true,
    minify: true,
    platform: "browser",
    outfile,
    define: { "process.env.BS_DEBUG_CHECKS": "undefined", "process.env.BS_AI_DELAY_MS": "undefined" },
    plugins: [
        {
            name: "aiWorkerShims",
            setup(b) {
                b.onResolve({ filter: /\/loadCards$/ }, () => ({ path: shim("loadCards.ts") }))
                b.onResolve({ filter: /\/coverageRecorder$/ }, () => ({ path: shim("coverageRecorder.ts") }))
            },
        },
    ],
})

// ---- 確認：process も require も無い環境で1戦を始め、人間の番まで AI が進められること ----
const cardsDir = path.join(root, "data/cards")
const cards = readdirSync(cardsDir)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => JSON.parse(readFileSync(path.join(cardsDir, file), "utf-8")))
const body = JSON.stringify(cards)
const received = []
const self = { postMessage: (m) => received.push(m), onmessage: null }
class XMLHttpRequest {
    open() {}
    send() {
        this.status = 200
        this.responseText = body
    }
}
const context = vm.createContext({ self, XMLHttpRequest, console, crypto: globalThis.crypto, setTimeout: (fn) => setTimeout(fn, 0), clearTimeout })
vm.runInContext(readFileSync(outfile, "utf-8"), context)
self.onmessage({ data: { event: "startAi", payload: { name: "確認", deck: "sd01_blazing", aiDeck: "sd01_blazing" } } })
// AI が先攻なら、打ち切って人間の番（または人間への選択待ち）に来るまで待つ
const humanToAct = (v) => v && (v.turnPlayer === "p1" || v.pendingChoice?.pid === "p1" || v.winner)
const lastState = () => received.filter((m) => m.event === "state").at(-1)?.payload
for (let i = 0; i < 100 && !humanToAct(lastState()); i++) await new Promise((r) => setTimeout(r, 50))
const last = lastState()
const fail = (why) => {
    console.error(`❌ aiWorker の確認に失敗: ${why}`)
    process.exit(1)
}
if (received[0]?.event !== "joined") fail(`最初の応答が joined でない（${JSON.stringify(received[0])?.slice(0, 200)}）`)
if (!last || last.you !== "p1") fail("state が届かない")
if (!humanToAct(last)) fail(`AI の番のまま止まっている（turnPlayer=${last.turnPlayer} phase=${last.phase}）`)
self.onmessage({ data: { event: "action", payload: { type: "attack", instanceId: "存在しない" } } })
if (received.at(-1)?.event !== "errorMessage") fail(`不正な操作に errorMessage が返らない（${JSON.stringify(received.at(-1))?.slice(0, 300)}）`)
console.log(`aiWorker: ${(readFileSync(outfile).length / 1024).toFixed(0)}KB、Node 無しの環境で対戦開始まで確認`)
