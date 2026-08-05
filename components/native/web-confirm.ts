// In-app confirm dialog for the web, used as the fallback under confirmDialog()
// in place of window.confirm().
//
// Why not window.confirm: it is the one primitive in this app a click can hit
// and produce NOTHING. Browsers suppress it silently — a sandboxed iframe
// without allow-modals, an in-app/embedded WebView with no JS-dialog delegate,
// an installed PWA, or a tab where the user ticked "prevent this page from
// creating additional dialogs" — and each of those makes confirm() return false
// with no dialog drawn. Every call site here reads that as "the admin cancelled"
// and quietly does nothing, which is exactly what a dead button looks like.
//
// This dialog is plain DOM (no React) so the async confirmDialog() helper can
// present it from anywhere — event handlers, non-component modules — without a
// provider mounted above the call site. It paints with the app's own tokens, so
// it follows light/dark and the active skin.

type ConfirmOptions = {
  title?: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

const OVERLAY_Z = "2147483000"; // above every in-app layer (modals sit at z-50)

/**
 * Present the in-app confirm and resolve true only if the user confirms.
 * Resolves false when dismissed (Escape / backdrop / Cancel), and false — never
 * hanging — when there is no document to render into.
 */
export function webConfirm(opts: ConfirmOptions): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-web-confirm", "");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      `z-index:${OVERLAY_Z}`,
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "padding:max(1rem, var(--top-nav-h, 0px)) 1rem max(1rem, var(--mobile-nav-h, 0px))",
      "background:rgb(var(--shadow) / 0.45)",
      "backdrop-filter:blur(12px)",
      "-webkit-backdrop-filter:blur(12px)"
    ].join(";");

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.style.cssText = [
      "width:100%",
      "max-width:26rem",
      "max-height:100%",
      "overflow:auto",
      "border-radius:1.25rem",
      "border:1px solid rgb(var(--glass-stroke-soft) / 0.55)",
      "background:rgb(var(--bg-elev))",
      "color:rgb(var(--text))",
      "box-shadow:0 30px 60px rgb(var(--shadow) / 0.35)",
      "padding:1.25rem",
      "font:inherit"
    ].join(";");

    if (opts.title) {
      const h = document.createElement("h2");
      h.textContent = opts.title;
      h.style.cssText = "margin:0 0 .5rem;font-size:1rem;font-weight:600;line-height:1.35";
      dialog.appendChild(h);
      dialog.setAttribute("aria-label", opts.title);
    }

    const body = document.createElement("p");
    body.textContent = opts.message;
    body.style.cssText =
      "margin:0;font-size:.875rem;line-height:1.5;color:rgb(var(--subtext));white-space:pre-wrap";
    dialog.appendChild(body);

    const actions = document.createElement("div");
    actions.style.cssText = "margin-top:1.25rem;display:flex;gap:.5rem;justify-content:flex-end;flex-wrap:wrap";

    const baseBtn =
      "min-height:40px;padding:.5rem 1rem;border-radius:.625rem;font-size:.875rem;font-weight:500;cursor:pointer;border:1px solid transparent";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = opts.cancelLabel ?? "Cancel";
    cancel.style.cssText = `${baseBtn};border-color:rgb(var(--glass-stroke-soft) / 0.55);background:rgb(var(--surface) / 0.7);color:rgb(var(--text))`;

    const ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = opts.okLabel ?? "OK";
    ok.style.cssText = opts.destructive
      ? `${baseBtn};border-color:rgb(var(--error));background:rgb(var(--error));color:rgb(var(--bg));font-weight:600`
      : `${baseBtn};border-color:rgb(var(--text));background:rgb(var(--text));color:rgb(var(--bg));font-weight:600`;

    actions.append(cancel, ok);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);

    const previouslyFocused = document.activeElement as HTMLElement | null;
    let settled = false;

    const close = (result: boolean) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      previouslyFocused?.focus?.();
      resolve(result);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(false);
        return;
      }
      // Keep focus inside the dialog while it is open.
      if (event.key === "Tab") {
        const focusables = [cancel, ok];
        const active = document.activeElement;
        const index = focusables.indexOf(active as HTMLButtonElement);
        const next = event.shiftKey ? index - 1 : index + 1;
        event.preventDefault();
        focusables[(next + focusables.length) % focusables.length].focus();
      }
    };

    cancel.addEventListener("click", () => close(false));
    ok.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(false);
    });
    // The slide-deck pages listen on window for wheel/touch to flip slides.
    for (const type of ["wheel", "touchstart", "touchmove", "touchend"] as const) {
      overlay.addEventListener(type, (event) => event.stopPropagation());
    }
    document.addEventListener("keydown", onKey, true);

    document.body.appendChild(overlay);
    ok.focus();
  });
}
