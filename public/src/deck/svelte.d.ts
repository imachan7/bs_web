// .svelte の import を tsc に通すための宣言（.svelte の中身の型は svelte-check が見る）
declare module "*.svelte" {
    import type { Component } from "svelte"
    const component: Component
    export default component
}
