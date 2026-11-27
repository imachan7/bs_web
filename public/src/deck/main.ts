// デッキ構築ページのエントリ。Svelte の App を #deck-app へマウントする
import { mount } from "svelte"
import { installSecretCardArt } from "../cardArt"
import App from "./App.svelte"
import { artEpoch } from "./state/artEpoch.svelte"
import { showToast } from "./state/toast.svelte"

installSecretCardArt((message) => {
    showToast(message)
    artEpoch.n++
})
mount(App, { target: document.getElementById("deck-app")! })
