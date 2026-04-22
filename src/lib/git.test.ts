import { describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { backupRepo } from './git';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('backupRepo', () => {
  it('should call invoke with git_backup and sourcePath and return the result', async () => {
    const mockedInvoke = vi.mocked(invoke);
    const expectedPath = '/backups/repo-backup.zip';
    mockedInvoke.mockResolvedValueOnce(expectedPath);

    const sourcePath = '/my/repo/path';
    const result = await backupRepo(sourcePath);

    expect(mockedInvoke).toHaveBeenCalledWith('git_backup', { sourcePath });
    expect(result).toBe(expectedPath);
  });

  it('should throw an error if invoke fails', async () => {
    const mockedInvoke = vi.mocked(invoke);
    const error = new Error('Backup failed');
    mockedInvoke.mockRejectedValueOnce(error);

    const sourcePath = '/my/repo/path';
    await expect(backupRepo(sourcePath)).rejects.toThrow('Backup failed');
  });
});
