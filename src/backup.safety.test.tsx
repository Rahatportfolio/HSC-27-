// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_AT_KEY, BACKUP_SNOOZE_KEY, backupAgeDays, backupLabel, isBackupSnoozed, lastBackupAt, needsBackup } from './backup';
import { setLanguage } from './i18n';
import { BackupNudge } from './components';
import { PlannerContext } from './context';
import type { PlannerContextValue } from './context';
import { freshData } from './planner';

beforeEach(() => { localStorage.clear(); setLanguage('en'); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe('full recheck: backup reminders survive restricted storage and Dhaka midnight', () => {
  it('does not crash the dashboard when a readable Storage object rejects getItem', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    expect(() => lastBackupAt()).not.toThrow();
    expect(() => isBackupSnoozed('2026-11-21')).not.toThrow();
    const data = freshData(); data.notes['2026-11-20'] = 'Protect this note';
    expect(needsBackup(data, '2026-11-21')).toBe(true);
  });
  it('measures backup age by Bangladesh calendar days, not the timestamp’s UTC prefix', () => {
    localStorage.setItem(BACKUP_AT_KEY, '2026-11-20T18:30:00.000Z'); // 21 November, 00:30 in Dhaka.
    expect(backupAgeDays('2026-11-21')).toBe(0);
    expect(backupAgeDays('2026-11-22')).toBe(1);
    expect(backupLabel('2026-11-21')).toBe('Backed up today');
    expect(backupLabel('2026-11-22')).toBe('Backed up 1 day(s) ago');
    setLanguage('bn'); expect(backupLabel('2026-11-21')).toBe('আজ ব্যাকআপ নেওয়া হয়েছে');
  });
  it('does not allow a malformed snooze or backup date to suppress reminders', () => {
    localStorage.setItem(BACKUP_SNOOZE_KEY, 'zzz');
    localStorage.setItem(BACKUP_AT_KEY, '2026-02-31T12:00:00Z');
    expect(isBackupSnoozed('2026-11-21')).toBe(false);
    expect(lastBackupAt()).toBeNull();
  });
  it('does not label an unexplained future backup record as a backup taken today', () => {
    localStorage.setItem(BACKUP_AT_KEY, '2030-01-01T12:00:00Z');
    expect(backupAgeDays('2026-11-21')).toBeNull();
  });
  it('explains the image-byte boundary and offers full backup to a scanner-only profile', () => {
    const data = freshData();
    data.scannedNotes = [{ id: 'saved-scan', subject: 'physics', title: 'Only handwritten page', pageCount: 1, pageKeys: ['scan:saved-page'], sizeBytes: 100, pdfExported: false, createdAt: '2026-11-20T12:00:00Z' }];
    const navigate = vi.fn();
    render(<PlannerContext.Provider value={{ data, notify: vi.fn(), navigate } as unknown as PlannerContextValue}><BackupNudge /></PlannerContext.Provider>);
    expect(screen.getByRole('note').textContent).toContain('JSON does not include scanned images');
    fireEvent.click(screen.getByRole('button', { name: 'Open full backup' }));
    expect(navigate).toHaveBeenCalledWith('settings');
    expect(localStorage.getItem(BACKUP_AT_KEY)).toBeNull();
  });
});
