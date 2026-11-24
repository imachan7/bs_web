// deck-next のエントリ。Svelte の App を #deck-app へマウントする
import { mount } from "svelte"
import App from "./App.svelte"

mount(App, { target: document.getElementById("deck-app")! })
