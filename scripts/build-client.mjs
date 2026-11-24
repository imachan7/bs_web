// クライアントの束ね。引数 --watch で監視、無ければ minify して1回だけ。
// deck は Svelte（#703）。他のエントリには svelte プラグインの影響が及ばない（.svelte だけを見る）
import { build, context } from "esbuild"
import sveltePlugin from "esbuild-svelte"

const watch = process.argv.includes("--watch")
const options = {
    entryPoints: {
        main: "public/src/main.ts",
        bugreport: "public/src/bugreport.ts",
        deck: "public/src/deck/main.ts",
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
