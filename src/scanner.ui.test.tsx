// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlannerContext } from './context';
import type { ConfirmRequest, PlannerContextValue } from './context';
import { freshData } from './planner';
import type { AppData } from './planner';
import { setLanguage } from './i18n';
const mock = vi.hoisted(() => ({
  save: vi.fn(async () => ['scan:new']), remove: vi.fn(async () => true), persist: vi.fn(() => true),
  loadPages: vi.fn(async () => ['data:image/png;base64,aGVsbG8=']), exportFile: vi.fn(async (_blob: Blob, _name: string) => {}),
  load: vi.fn(async (_source: string | File) => ({ width: 2, height: 1 })),
  encode: vi.fn((_canvas: unknown): string => ''),
  rotate: vi.fn((canvas: { width: number; height: number }) => ({ width: canvas.height, height: canvas.width })),
  adjust: vi.fn(), crop: vi.fn((canvas: unknown) => canvas), perspective: vi.fn((canvas: unknown) => canvas),
  notify: vi.fn(), confirm: vi.fn<(request: ConfirmRequest) => void>(),
}));
vi.mock('./scanner', async importOriginal => ({
  ...await importOriginal<typeof import('./scanner')>(),
  loadImageToCanvas: mock.load, canvasToDataUrl: mock.encode,
  rotateCanvas: mock.rotate, adjustImage: mock.adjust, cropCanvas: mock.crop, perspectiveCorrect: mock.perspective,
  savePagesToDb: mock.save, deletePagesFromDb: mock.remove, loadPagesFromDb: mock.loadPages,
}));
vi.mock('./storage', async importOriginal => ({ ...await importOriginal<typeof import('./storage')>(), saveData: mock.persist }));
vi.mock('./mediaBackup', () => ({ saveBackupBlob: mock.exportFile }));
vi.mock('jspdf', () => ({ default: class {
  internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
  addPage() {} addImage() {}
  output() { return new Blob(['%PDF-1.7'], { type: 'application/pdf' }); }
} }));
vi.mock('./storage-manager', () => ({ idbGet: vi.fn(async () => 'data:image/png;base64,aGVsbG8=') }));
import NotesScanner from './views/NotesScanner';
let latest: AppData;
let replace: PlannerContextValue['setData'];
function Harness({ initial = freshData(), rejectRender = false }: { initial?: AppData; rejectRender?: boolean }) {
  const [data, setData] = useState(initial);
  latest = data; replace = setData;
  return <PlannerContext.Provider value={{ data, setData: rejectRender ? () => { throw new Error('Render unavailable after commit'); } : setData, notify: mock.notify, confirm: mock.confirm } as unknown as PlannerContextValue}><NotesScanner /></PlannerContext.Provider>;
}
const note = () => ({ id: 'restored', title: 'Restored scan', subject: 'physics' as const, createdAt: '2026-11-20T20:00:00Z', pageCount: 1, sizeBytes: 100, pdfExported: false, pageKeys: ['scan:restored'] });
beforeEach(() => {
  localStorage.clear(); setLanguage('en'); vi.clearAllMocks();
  mock.persist.mockReturnValue(true);
  mock.remove.mockReset().mockResolvedValue(true);
  mock.load.mockReset().mockResolvedValue({ width: 2, height: 1 });
  let image = 0;
  mock.encode.mockImplementation(() => `data:image/png;base64,${btoa(String(++image))}`);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const chooseImage = async () => {
  fireEvent.change(screen.getByLabelText('Choose note images from files'), { target: { files: [new File(['image'], 'note.png', { type: 'image/png' })] } });
  await screen.findByLabelText('Title');
};

describe('scanner library follows the actual backed-up app data', () => {
  it('shows restored metadata rather than a stale separate localStorage list', async () => {
    const initial = freshData();
    initial.scannedNotes = [note()];
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved notes' }));
    expect(await screen.findByText('Restored scan')).toBeTruthy();
    expect(screen.getByText('21 Nov')).toBeTruthy(); // Actual instant expressed in Bangladesh time.
  });
  it('does not crash on an ISO creation timestamp and refreshes after a profile replacement', async () => {
    const initial = freshData(); initial.scannedNotes = [note()];
    localStorage.setItem('hsc27-scanned-notes-meta', JSON.stringify(initial.scannedNotes));
    render(<Harness initial={initial} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Saved notes' }))).not.toThrow();
    expect(screen.getByText('Restored scan')).toBeTruthy();
    act(() => replace(freshData()));
    expect(screen.queryByText('Restored scan')).toBeNull();
    expect(screen.getByText('No scanned notes yet')).toBeTruthy();
  });
  it('shows a just-saved note immediately and requires confirmation before deleting its images', async () => {
    render(<Harness />);
    await chooseImage();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New saved scan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as note' }));
    await waitFor(() => expect(latest.scannedNotes).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Saved notes' }));
    expect(await screen.findByText('New saved scan')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete scanned note: New saved scan' }));
    expect(mock.remove).not.toHaveBeenCalled();
    await act(async () => mock.confirm.mock.calls[0][0].action());
    await waitFor(() => expect(screen.queryByText('New saved scan')).toBeNull());
    expect(mock.remove).toHaveBeenCalledWith(['scan:new']);
    expect(latest.scannedNotes).toEqual([]);
  });
  it('warns when metadata is deleted but stored scan images could not be erased', async () => {
    mock.remove.mockResolvedValue(false);
    const initial = freshData(); initial.scannedNotes = [note()];
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved notes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete scanned note: Restored scan' }));
    await act(async () => mock.confirm.mock.calls[0][0].action());
    await waitFor(() => expect(mock.notify).toHaveBeenCalledWith(expect.stringContaining('image data could not be erased'), 'error'));
    expect(latest.scannedNotes).toEqual([]);
    expect(mock.notify).not.toHaveBeenCalledWith('Note deleted.', 'success');
  });
  it('keeps the editable page and removes staged images when note metadata cannot be saved', async () => {
    mock.persist.mockReturnValue(false);
    render(<Harness />); await chooseImage();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Not safely saved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as note' }));
    await waitFor(() => expect(mock.remove).toHaveBeenCalledWith(['scan:new']));
    expect(latest.scannedNotes).toEqual([]);
    expect(screen.getByRole('img', { name: 'scanned page' })).toBeTruthy();
    expect(mock.notify).toHaveBeenLastCalledWith(expect.any(String), 'error');
  });
  it('does not destroy image bytes when deleting note metadata is rejected', async () => {
    mock.persist.mockReturnValue(false);
    const initial = freshData(); initial.scannedNotes = [note()];
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved notes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete scanned note: Restored scan' }));
    await act(async () => mock.confirm.mock.calls[0][0].action());
    expect(mock.remove).not.toHaveBeenCalled();
    expect(latest.scannedNotes).toEqual(initial.scannedNotes);
    expect(screen.getByText('Restored scan')).toBeTruthy();
  });
  it('uses the original image for successive edits and accepts zero brightness', async () => {
    render(<Harness />); await chooseImage();
    const original = screen.getByRole('img', { name: 'scanned page' }).getAttribute('src');
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    await waitFor(() => expect(mock.rotate).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('img', { name: 'scanned page' }).getAttribute('src')).not.toBe(original));
    fireEvent.change(screen.getByLabelText('Brightness'), { target: { value: '0' } });
    await waitFor(() => expect(mock.adjust).toHaveBeenCalled());
    expect(mock.load).toHaveBeenLastCalledWith(original);
    expect((screen.getByLabelText('Brightness') as HTMLInputElement).value).toBe('0');
    expect(mock.adjust).toHaveBeenLastCalledWith(expect.anything(), { brightness: 0, contrast: 100 });
    fireEvent.change(screen.getByLabelText('Contrast'), { target: { value: '0' } });
    await waitFor(() => expect(mock.adjust).toHaveBeenLastCalledWith(expect.anything(), { brightness: 0, contrast: 0 }));
    expect((screen.getByLabelText('Contrast') as HTMLInputElement).value).toBe('0');
  });
  it('exposes actual crop controls and rejects out-of-bounds edits before saving', async () => {
    render(<Harness />); await chooseImage();
    fireEvent.click(screen.getByRole('button', { name: 'Crop' }));
    const width = await screen.findByLabelText('Crop width');
    fireEvent.change(width, { target: { value: '1' } });
    await waitFor(() => expect(mock.crop).toHaveBeenCalledWith(expect.anything(), 0, 0, 1, 1));
    fireEvent.change(width, { target: { value: '99' } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Invalid crop' } });
    expect((screen.getByRole('button', { name: 'Save as note' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('does not let a slower old edit replace the most recently requested result', async () => {
    render(<Harness />); await chooseImage();
    let oldDone!: (canvas: { width: number; height: number }) => void;
    let newDone!: (canvas: { width: number; height: number }) => void;
    mock.load.mockImplementationOnce(() => new Promise(resolve => { oldDone = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { newDone = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    fireEvent.change(screen.getByLabelText('Brightness'), { target: { value: '150' } });
    await act(async () => newDone({ width: 2, height: 1 }));
    const newest = screen.getByRole('img', { name: 'scanned page' }).getAttribute('src');
    await act(async () => oldDone({ width: 2, height: 1 }));
    expect(screen.getByRole('img', { name: 'scanned page' }).getAttribute('src')).toBe(newest);
    expect((screen.getByLabelText('Brightness') as HTMLInputElement).value).toBe('150');
  });
  it('rolls staged pages back instead of replacing progress changed during an asynchronous save', async () => {
    render(<Harness />); await chooseImage();
    let finish!: (keys: string[]) => void;
    mock.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Concurrent scan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as note' }));
    act(() => replace(current => ({ ...current, notes: { '2026-11-20': 'New real progress' } })));
    await act(async () => finish(['scan:new']));
    expect(mock.remove).toHaveBeenCalledWith(['scan:new']);
    expect(mock.persist).not.toHaveBeenCalled();
    expect(latest.notes['2026-11-20']).toBe('New real progress');
  });
  it('never rolls back image bytes after metadata is already durably committed', async () => {
    render(<Harness rejectRender />); await chooseImage();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Durable scan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as note' }));
    await waitFor(() => expect(mock.persist).toHaveBeenCalled());
    await waitFor(() => expect(mock.notify).toHaveBeenLastCalledWith(expect.any(String), 'error'));
    expect(mock.remove).not.toHaveBeenCalled();
  });
  it('retains separate edit settings while navigating between scanned pages', async () => {
    render(<Harness />); await chooseImage();
    fireEvent.change(screen.getByLabelText('Brightness'), { target: { value: '150' } });
    await waitFor(() => expect(mock.adjust).toHaveBeenCalled());
    await chooseImage();
    expect((screen.getByLabelText('Brightness') as HTMLInputElement).value).toBe('100');
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect((screen.getByLabelText('Brightness') as HTMLInputElement).value).toBe('150');
    fireEvent.click(screen.getByRole('button', { name: 'Reset edits' }));
    await waitFor(() => expect((screen.getByLabelText('Brightness') as HTMLInputElement).value).toBe('100'));
  });
  it('opens new images from the saved library and keeps the remaining page reachable after removal', async () => {
    const initial = freshData(); initial.scannedNotes = [note()];
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved notes' }));
    await chooseImage();
    await chooseImage();
    const second = screen.getByRole('img', { name: 'scanned page' }).getAttribute('src');
    fireEvent.click(screen.getByRole('button', { name: 'Remove current page' }));
    expect(screen.getByRole('img', { name: 'scanned page' }).getAttribute('src')).not.toBe(second);
    expect((screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('validates perspective corners and lets invalid edits be reset without losing the source', async () => {
    render(<Harness />); await chooseImage();
    fireEvent.click(screen.getByRole('button', { name: 'Perspective' }));
    await waitFor(() => expect(mock.perspective).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Top-left x'), { target: { value: '99' } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/inside/);
    fireEvent.change(screen.getByLabelText('Top-left x'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Top-left y'), { target: { value: '1' } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/non-crossing/));
    fireEvent.click(screen.getByRole('button', { name: 'Reset edits' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByRole('img', { name: 'scanned page' })).toBeTruthy();
  });
  it('exports every scanned page through the native-compatible file exporter', async () => {
    const initial = freshData(); initial.scannedNotes = [note()];
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved notes' }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(mock.exportFile).toHaveBeenCalledWith(expect.any(Blob), 'Restored_scan.pdf'));
    expect(latest.scannedNotes[0].pdfExported).toBe(true);
  });
  it('reports an invalid image instead of throwing or marking a broken PDF exported', async () => {
    const initial = freshData(); initial.scannedNotes = [note()];
    mock.load.mockRejectedValueOnce(new Error('Image decode failed'));
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved notes' }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(mock.notify).toHaveBeenCalledWith(expect.any(String), 'error'));
    expect(mock.exportFile).not.toHaveBeenCalled();
    expect(latest.scannedNotes[0].pdfExported).toBe(false);
  });
  it('does not export an incomplete note whose image count differs from its metadata', async () => {
    const initial = freshData(); initial.scannedNotes = [{ ...note(), pageCount: 2 }];
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved notes' }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(mock.notify).toHaveBeenCalledWith(expect.any(String), 'error'));
    expect(mock.exportFile).not.toHaveBeenCalled();
    expect(latest.scannedNotes[0].pdfExported).toBe(false);
  });
  it('leaves the original scan unmarked if the PDF destination rejects the export', async () => {
    mock.exportFile.mockRejectedValueOnce(new Error('Destination is full'));
    const initial = freshData(); initial.scannedNotes = [note()];
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved notes' }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(mock.notify).toHaveBeenCalledWith(expect.any(String), 'error'));
    expect(latest.scannedNotes[0].pdfExported).toBe(false);
  });
  it('keeps save disabled while an image edit has not finished processing', async () => {
    render(<Harness />); await chooseImage();
    let finish!: (canvas: { width: number; height: number }) => void;
    mock.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Still processing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    const save = screen.getByRole('button', { name: 'Save as note' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(mock.save).not.toHaveBeenCalled();
    await act(async () => finish({ width: 2, height: 1 }));
    expect(save.disabled).toBe(false);
  });
  it('limits an image-selection batch to 50 pages instead of producing unrestorable metadata', async () => {
    render(<Harness />);
    const files = Array.from({ length: 51 }, (_, index) => new File(['image'], `page-${index}.png`, { type: 'image/png' }));
    fireEvent.change(screen.getByLabelText('Choose note images from files'), { target: { files } });
    await waitFor(() => expect(mock.notify).toHaveBeenCalledWith(expect.stringContaining('at most 50'), 'info'));
    expect(mock.load).toHaveBeenCalledTimes(50);
  });
  it('refuses a 201st scanned note without staging any new image bytes', async () => {
    const initial = freshData(); initial.scannedNotes = Array.from({ length: 200 }, (_, index) => ({ ...note(), id: `note-${index}` }));
    render(<Harness initial={initial} />); await chooseImage();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Over the metadata limit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as note' }));
    expect(mock.save).not.toHaveBeenCalled();
    expect(latest.scannedNotes).toHaveLength(200);
  });
  it('rejects a title too long to survive the app backup validator before writing images', async () => {
    render(<Harness />); await chooseImage();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'x'.repeat(301) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as note' }));
    expect(mock.save).not.toHaveBeenCalled();
    expect(latest.scannedNotes).toEqual([]);
  });
});

it('keeps shared image pages that are still referenced by another restored note', async () => {
  const initial = freshData();
  initial.scannedNotes = [{ ...note(), pageKeys: ['scan:restored', 'scan:unique'], pageCount: 2 }, { ...note(), id: 'second', title: 'Second note', pageKeys: ['scan:restored', 'scan:second'], pageCount: 2 }];
  render(<Harness initial={initial} />);
  fireEvent.click(screen.getByRole('button', { name: 'Saved notes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete scanned note: Restored scan' }));
  await act(async () => mock.confirm.mock.calls[0][0].action());
  await waitFor(() => expect(latest.scannedNotes).toHaveLength(1));
  expect(latest.scannedNotes[0].pageKeys).toEqual(['scan:restored', 'scan:second']);
  expect(mock.remove).toHaveBeenCalledWith(['scan:unique']);
  expect(mock.remove).not.toHaveBeenCalledWith(expect.arrayContaining(['scan:restored']));
});
