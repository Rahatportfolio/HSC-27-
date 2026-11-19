/** One keyboard/focus owner for stacked dialogs, including dialogs rendered
 * inside a view rather than a portal. No profile/storage state is touched.
 * `inert` blocks pointer/Tab access; aria-hidden plus the focus guard also protect
 * older WebViews without native inert support. Original attributes are restored.
 */
interface DialogEntry { element: HTMLElement; close: () => void; previous: HTMLElement | null }
interface AttributeSnapshot { previous: string | null; applied: string }
interface DialogState {
  entries: DialogEntry[];
  changed: Map<Element, Map<string, AttributeSnapshot>>;
  overflow: string;
  overflowPriority: string;
  observer: MutationObserver | null;
  key: (event: KeyboardEvent) => void;
  focus: (event: FocusEvent) => void;
  pointer: (event: Event) => void;
}
const states = new WeakMap<Document, DialogState>();
const selector = 'button,input,select,textarea,a[href],area[href],iframe,audio[controls],video[controls],summary,[tabindex],[contenteditable="true"]';
function exposed(element: HTMLElement, root: HTMLElement): boolean {
  if (element.matches(':disabled,input[type="hidden"]')) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden || node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true') return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return false;
    if (node instanceof HTMLDetailsElement && !node.open) {
      const summary = Array.from(node.children).find(child => child.tagName === 'SUMMARY');
      if (!summary?.contains(element)) return false;
    }
    if (node === root) break;
  }
  return true;
}
const usable = (element: HTMLElement, root: HTMLElement): boolean => element.tabIndex >= 0 && exposed(element, root);
function controls(root: HTMLElement): HTMLElement[] { return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(element => usable(element, root)); }
function focusFirst(root: HTMLElement): void {
  const preferred = root.querySelector<HTMLElement>('[data-autofocus]');
  const target = preferred && usable(preferred, root) ? preferred : controls(root)[0] || root;
  target.focus({ preventScroll: true });
}
function changeAttribute(state: DialogState, element: Element, name: string, value: string): void {
  let attributes = state.changed.get(element);
  if (!attributes) { attributes = new Map(); state.changed.set(element, attributes); }
  if (!attributes.has(name)) attributes.set(name, { previous: element.getAttribute(name), applied: value });
  else attributes.get(name)!.applied = value;
  element.setAttribute(name, value);
}
function restore(state: DialogState): void {
  for (const [element, attributes] of state.changed) for (const [name, snapshot] of attributes) {
    // React may have already closed/resized a still-mounted drawer. Restore only
    // attributes we own, and do not overwrite a newer value from its render.
    if (element.getAttribute(name) !== snapshot.applied) continue;
    if (snapshot.previous === null) element.removeAttribute(name); else element.setAttribute(name, snapshot.previous);
  }
  state.changed.clear();
}
function isolate(document: Document, state: DialogState): void {
  restore(state);
  const top = state.entries.at(-1); if (!top?.element.isConnected) return;
  for (const entry of state.entries) {
    changeAttribute(state, entry.element, 'aria-modal', entry === top ? 'true' : 'false');
  }
  // Do not hide an ancestor containing the active dialog. Isolate siblings on
  // each level instead, so both nested and root-level sheets work correctly.
  for (let branch: Element = top.element; branch.parentElement; branch = branch.parentElement) {
    for (const sibling of Array.from(branch.parentElement.children)) if (sibling !== branch && !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) {
      changeAttribute(state, sibling, 'inert', ''); changeAttribute(state, sibling, 'aria-hidden', 'true');
    }
    if (branch.parentElement === document.body) break;
  }
}
export function openDialogScope(element: HTMLElement, close: () => void): () => void {
  const document = element.ownerDocument;
  let state = states.get(document);
  if (!state) {
    const created: DialogState = { entries: [], changed: new Map(), overflow: document.body.style.getPropertyValue('overflow'), overflowPriority: document.body.style.getPropertyPriority('overflow'), observer: null,
      key: event => {
        const top = created.entries.at(-1); if (!top) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); top.close(); return; }
        if (event.key !== 'Tab') return;
        const items = controls(top.element), first = items[0], last = items.at(-1), active = document.activeElement;
        if (!first) { event.preventDefault(); top.element.focus({ preventScroll: true }); }
        else if (!top.element.contains(active) || active === top.element || !items.includes(active as HTMLElement)) { event.preventDefault(); (event.shiftKey ? last! : first).focus(); }
        else if (event.shiftKey && active === first) { event.preventDefault(); last!.focus(); }
        else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
      },
      focus: event => { const top = created.entries.at(-1); if (top?.element.isConnected && event.target instanceof Node && !top.element.contains(event.target)) focusFirst(top.element); },
      pointer: event => {
        const top = created.entries.at(-1), target = event.target;
        if (!top?.element.isConnected || !(target instanceof Node) || top.element.contains(target)) return;
        // Keep only the active sheet's own backdrop dismissible. This fallback
        // also prevents background mutations on WebViews without native inert.
        if (target === top.element.parentElement && top.element.parentElement?.classList.contains('modal-backdrop')) return;
        event.preventDefault(); event.stopImmediatePropagation();
      },
    };
    state = created; states.set(document, state);
    document.body.style.setProperty('overflow', 'hidden');
    document.addEventListener('keydown', state.key, true); document.addEventListener('focusin', state.focus, true);
    for (const type of ['pointerdown', 'mousedown', 'click']) document.addEventListener(type, state.pointer, true);
    const Observer = document.defaultView?.MutationObserver;
    if (Observer) { state.observer = new Observer(() => isolate(document, created)); state.observer.observe(document.body, { childList: true, subtree: true }); }
  }
  const entry: DialogEntry = { element, close, previous: document.activeElement as HTMLElement | null };
  // Child effects may mount before their parent's effect. Keep the descendant
  // on top even when both sheets appear in the same React commit.
  const descendant = state.entries.findIndex(other => element.contains(other.element));
  if (descendant < 0) state.entries.push(entry); else state.entries.splice(descendant, 0, entry);
  isolate(document, state);
  if (state.entries.at(-1) === entry) focusFirst(element);
  const current = state;
  return () => {
    const wasTop = current.entries.at(-1) === entry, index = current.entries.indexOf(entry);
    if (index < 0) return;
    current.entries.splice(index, 1); isolate(document, current);
    const top = current.entries.at(-1);
    if (!top) {
      current.observer?.disconnect();
      document.removeEventListener('keydown', current.key, true); document.removeEventListener('focusin', current.focus, true);
      for (const type of ['pointerdown', 'mousedown', 'click']) document.removeEventListener(type, current.pointer, true);
      if (current.overflow) document.body.style.setProperty('overflow', current.overflow, current.overflowPriority); else document.body.style.removeProperty('overflow');
      states.delete(document);
    }
    if (wasTop) {
      const previous = entry.previous;
      if (previous?.isConnected && previous !== document.body && exposed(previous, document.body) && (!top || top.element.contains(previous))) previous.focus({ preventScroll: true });
      else if (top) focusFirst(top.element);
      else document.getElementById('main-content')?.focus({ preventScroll: true });
    }
  };
}
