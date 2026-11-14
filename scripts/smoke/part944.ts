// smoke パート944（配信物の版：HTML の URL に版を付け、今の版の要求にだけ長期キャッシュを許す。docs/ops/PERF_PLAN.md §4）
import { assert } from "./helpers"
import { contentVersion, isCurrentVersion, versionHtml } from "../../server/src/assetVersions"

console.log("=== 配信物の版 ===")
{
    const versions = new Map([
        ["/dist/main.js", contentVersion("a")],
        ["/api/cards", contentVersion("b")],
    ])
    const html = versionHtml('<meta name="asset" content="/api/cards" /><script src="/dist/main.js"></script><script src="/dist/main.js.map"></script>', versions)
    assert(html.includes(`content="/api/cards?v=${contentVersion("b")}"`), "meta の URL に版が付く")
    assert(html.includes(`src="/dist/main.js?v=${contentVersion("a")}"`), "script の URL に版が付く")
    assert(html.includes('src="/dist/main.js.map"'), "表に無い URL には付かない")
    assert(contentVersion("a") !== contentVersion("b") && contentVersion("a") === contentVersion("a"), "版は中身で決まる")
    assert(isCurrentVersion(versions, "/dist/main.js", contentVersion("a")), "今の版の要求は長期キャッシュを許す")
    assert(!isCurrentVersion(versions, "/dist/main.js", contentVersion("b")), "古い版の要求は許さない")
    assert(!isCurrentVersion(versions, "/dist/main.js", undefined), "版なしの要求は許さない")
    assert(!isCurrentVersion(versions, "/dist/other.js", contentVersion("a")), "表に無いファイルは許さない")
}

console.log("すべてのチェックに合格しました 🎉（part944）")
