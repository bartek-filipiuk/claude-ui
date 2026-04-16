export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  const editable = target.getAttribute('contenteditable');
  if (editable && editable !== 'false') return true;
  const role = target.getAttribute('role');
  if (role === 'textbox' || role === 'combobox' || role === 'searchbox') return true;
  if (target.closest('[data-editor="codemirror"]')) return true;
  return false;
}

export function shouldToggleHelp(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return false;
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  if (event.key !== '?') return false;
  if (isEditableTarget(event.target)) return false;
  return true;
}
