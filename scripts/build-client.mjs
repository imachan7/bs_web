// クライアントの束ね。引数 --watch で監視、無ければ minify して1回だけ。
// deck-next は Svelte（#703 の試験導入）。既存3エントリには svelte プラグインの影響が及ばない（.svelte だけを見る）
import { build, context } from "esbuild"
import sveltePlugin from "esbuild-svelte"

const watch = process.argv.includes("--watch")
const options = {
    entryPoints: {
        main: "public/src/main.ts",
        deck: "public/src/deck.ts",
        bugreport: "public/src/bugreport.ts",
        "deck-next": "public/src/deck-next/main.ts",
    },
    bundle: true,
    outdir: "public/dist",
    minify: !watch,
    plugins: [sveltePlugin()],
}

if (watch) {
    const ctx = await context(options)
    await ctx.watch()
    console.log("watching...")
} else {
    await build(options)
}
