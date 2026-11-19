// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './components';
import { setLanguage } from './i18n';

beforeEach(() => { setLanguage('en'); document.body.style.overflow = ''; });
afterEach(() => { cleanup(); document.querySelectorAll('[data-test-external]').forEach(element => element.remove()); document.body.style.overflow = ''; vi.restoreAllMocks(); });

describe('shared modal keyboard and background isolation', () => {
  it('makes outside content inert while open, preserves previous attributes and restores the opener', () => {
    const opener = document.createElement('button'); opener.dataset.testExternal = ''; opener.textContent = 'Original opener'; document.body.append(opener); opener.focus();
    const view = render(<><section data-testid="outside" aria-hidden="false"><button>Background action</button></section><Modal title="Safe dialog" onClose={vi.fn()}><button>Finish</button></Modal></>);
    const outside = screen.getByTestId('outside');
    expect(outside.hasAttribute('inert')).toBe(true); expect(outside.getAttribute('aria-hidden')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' })).toBe(document.activeElement);
    view.unmount(); expect(outside.hasAttribute('inert')).toBe(false); expect(outside.getAttribute('aria-hidden')).toBe('false');
    expect(document.body.style.overflow).toBe(''); expect(document.activeElement).toBe(opener); opener.remove();
  });
  it('Escape closes only the top nested dialog and returns focus to its parent action', () => {
    const outerClose = vi.fn(), innerClose = vi.fn();
    function Nested() {
      const [inner, setInner] = useState(false);
      return <Modal title="Outer dialog" onClose={outerClose}><button onClick={() => setInner(true)}>Open inner</button>{inner && <Modal title="Inner dialog" onClose={() => { innerClose(); setInner(false); }}><button>Inner action</button></Modal>}</Modal>;
    }
    render(<Nested />); const opener = screen.getByRole('button', { name: 'Open inner' }); opener.focus(); fireEvent.click(opener);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(innerClose).toHaveBeenCalledOnce(); expect(outerClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Inner dialog' })).toBeNull(); expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('hidden');
  });
  it('keeps a simultaneously mounted nested sheet as the sole modal keyboard owner', () => {
    const outer = vi.fn(), inner = vi.fn();
    render(<Modal title="Mounted parent" onClose={outer}><button>Parent action</button><Modal title="Mounted child" onClose={inner}><button>Child action</button></Modal></Modal>);
    const parent = screen.getByRole('dialog', { name: 'Mounted parent' }), child = screen.getByRole('dialog', { name: 'Mounted child' });
    expect(parent.getAttribute('aria-modal')).toBe('false'); expect(child.getAttribute('aria-modal')).toBe('true');
    expect(child.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' }); expect(inner).toHaveBeenCalledOnce(); expect(outer).not.toHaveBeenCalled();
  });
  it('wraps Tab around visible enabled controls, not hidden/closed-detail descendants', () => {
    render(<Modal title="Visible controls" onClose={vi.fn()}><input disabled aria-label="Disabled input" /><button>Last visible action</button><div hidden><button>Hidden tail</button></div><details><summary>Optional details</summary><button>Closed detail action</button></details></Modal>);
    const dialog = screen.getByRole('dialog'), first = within(dialog).getByRole('button', { name: 'Close' });
    const last = within(dialog).getByText('Optional details'); last.focus(); fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    first.focus(); fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(last);
  });
  it('recaptures attempted programmatic focus outside the dialog without changing study data', () => {
    render(<><button>Outside action</button><Modal title="Focus stays here" onClose={vi.fn()}><button>Inside action</button></Modal></>);
    const outside = screen.getByText('Outside action'); outside.focus();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });
  it('blocks outside clicks even without native inert while keeping the active backdrop dismissible', () => {
    const outside = vi.fn(), close = vi.fn();
    render(<><button onClick={outside}>Background save</button><Modal title="Pointer isolation" onClose={close}><button>Inside</button></Modal></>);
    fireEvent.click(screen.getByText('Background save')); expect(outside).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!); expect(close).toHaveBeenCalledOnce();
  });
  it('does not return focus to an opener hidden while the dialog was open', () => {
    const opener = document.createElement('button'), main = document.createElement('main'); opener.dataset.testExternal = ''; main.dataset.testExternal = '';
    main.id = 'main-content'; main.tabIndex = -1; document.body.append(opener, main); opener.focus();
    const view = render(<Modal title="Resize-safe focus" onClose={vi.fn()}><button>Inside</button></Modal>);
    opener.style.display = 'none'; view.unmount(); expect(document.activeElement).toBe(main);
  });
  it('keeps scroll locking when a lower dialog unmounts before the upper one', () => {
    document.body.style.overflow = 'scroll';
    const view = render(<><Modal title="Lower" onClose={vi.fn()}><button>Lower action</button></Modal><Modal title="Upper" onClose={vi.fn()}><button>Upper action</button></Modal></>);
    view.rerender(<><Modal title="Upper" onClose={vi.fn()}><button>Upper action</button></Modal></>);
    expect(document.body.style.overflow).toBe('hidden');
    view.unmount(); expect(document.body.style.overflow).toBe('scroll');
  });
  it('isolates new outside siblings and restores a pre-existing inert state exactly', async () => {
    const reserved = document.createElement('div'); reserved.dataset.testExternal = ''; reserved.setAttribute('inert', ''); reserved.setAttribute('aria-hidden', 'true'); document.body.append(reserved);
    const view = render(<Modal title="Dynamic background" onClose={vi.fn()}><button>Inside</button></Modal>);
    const later = document.createElement('button'); later.dataset.testExternal = ''; later.textContent = 'Added after opening'; act(() => document.body.append(later));
    await waitFor(() => expect(later.hasAttribute('inert')).toBe(true));
    view.unmount(); expect(later.hasAttribute('inert')).toBe(false); expect(later.hasAttribute('aria-hidden')).toBe(false);
    expect(reserved.hasAttribute('inert')).toBe(true); expect(reserved.getAttribute('aria-hidden')).toBe('true'); reserved.remove(); later.remove();
  });
});
