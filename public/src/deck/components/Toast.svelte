<script lang="ts">
    import { toast } from "../state/toast.svelte"
</script>

{#if toast.message}<div class="toast" role="status">{toast.message}</div>{/if}

<style>
    .toast { position: fixed; left: 50%; bottom: 64px; transform: translateX(-50%); max-width: 90vw; padding: 8px 14px; border-radius: 8px; background: #000d; color: #fff; font-size: 13px; z-index: 50; }
</style>
