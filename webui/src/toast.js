// Minimal toast: toast("saved") from anywhere; ToastHost renders it.
export function toast(message) {
  window.dispatchEvent(new CustomEvent("mockman:toast", { detail: message }));
}
