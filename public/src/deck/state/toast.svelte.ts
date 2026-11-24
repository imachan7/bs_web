// 画面下の通知。同時に1件だけ出し、次が来たら置き換える
export const toast = $state({ message: "" })
let timer: ReturnType<typeof setTimeout> | null = null

export function showToast(message: string): void {
    toast.message = message
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (toast.message = ""), 2500)
}
