// .svelte の import を tsc に通すための宣言（svelte-check は未導入）
declare module "*.svelte" {
    import type { Component } from "svelte"
    const component: Component
    export default component
}
