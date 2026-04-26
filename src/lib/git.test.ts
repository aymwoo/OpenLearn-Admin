import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cloneRepo, pullRepo, backupRepo, runSmartPull } from './git';
import { invoke } from '@tauri-apps/api/core';

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

describe('git', () => {
  describe('pullRepo', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns success when pull is successful', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('Pull successful');

      const result = await pullRepo('/path/to/repo');

      expect(invoke).toHaveBeenCalledWith('git_pull', { path: '/path/to/repo', force: false });
      expect(result).toEqual({ success: true, message: 'Pull successful' });
    });

    it('returns success when pull is successful but invoke returns empty string', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('');

      const result = await pullRepo('/path/to/repo', true);

      expect(invoke).toHaveBeenCalledWith('git_pull', { path: '/path/to/repo', force: true });
      expect(result).toEqual({ success: true, message: 'Pull successful' });
    });

    it('returns failure when pull fails with an Error object', async () => {
      const error = new Error('Merge conflict');
      vi.mocked(invoke).mockRejectedValueOnce(error);

      const result = await pullRepo('/path/to/repo');

      expect(invoke).toHaveBeenCalledWith('git_pull', { path: '/path/to/repo', force: false });
      expect(result).toEqual({ success: false, message: 'Merge conflict' });
    });

    it('returns failure when pull fails with a string error', async () => {
      vi.mocked(invoke).mockRejectedValueOnce('Authentication failed');

      const result = await pullRepo('/path/to/repo');

      expect(invoke).toHaveBeenCalledWith('git_pull', { path: '/path/to/repo', force: false });
      expect(result).toEqual({ success: false, message: 'Authentication failed' });
    });

    it('maps gitee redirect replay errors to actionable chinese guidance', async () => {
      vi.mocked(invoke).mockRejectedValueOnce('too many redirects or authentication replays');

      const result = await pullRepo('/path/to/repo');

      expect(result).toEqual({
        success: false,
        message: 'Gitee HTTPS 认证被拒绝，请改用 SSH 地址或为 HTTPS 配置可用凭据/PAT',
      });
    });
  });

  describe('cloneRepo', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('maps clone redirect replay errors to actionable chinese guidance', async () => {
      vi.mocked(invoke).mockRejectedValueOnce('too many redirects or authentication replays');

      await expect(cloneRepo('https://gitee.com/a/b.git', '/path/to/repo')).rejects.toThrow(
        'Gitee HTTPS 认证被拒绝，请改用 SSH 地址或为 HTTPS 配置可用凭据/PAT',
      );
    });
  });

  describe('runSmartPull', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('maps smart pull auth replay errors to actionable chinese guidance', async () => {
      vi.mocked(invoke).mockRejectedValueOnce('Gitee HTTPS 认证被拒绝，请改用 SSH 地址或为 HTTPS 配置可用凭据/PAT');

      await expect(runSmartPull({
        remoteUrl: 'https://gitee.com/a/b.git',
        localPath: '/path/to/repo',
        branch: 'main',
        forcePush: false,
        backupBeforePull: true,
        versionFilePath: 'release.log',
        changelogFilePath: 'CHANGELOG.md',
        autoRestoreWebConfig: false,
      })).rejects.toThrow('Gitee HTTPS 认证被拒绝，请改用 SSH 地址或为 HTTPS 配置可用凭据/PAT');
    });
  });
});

});
