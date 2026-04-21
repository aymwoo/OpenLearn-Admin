import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import Settings from './page';

vi.mock('@/lib/git', () => ({
  DEFAULT_GIT_CONFIG: {
    remoteUrl: '',
    localPath: '',
    branch: 'main',
    forcePush: false,
    backupBeforePull: true,
    versionFilePath: 'release.log',
    changelogFilePath: 'CHANGELOG.md',
  },
  loadConfig: vi.fn(async () => null),
  saveConfig: vi.fn(async (config) => {
    localStorage.setItem('git-updater-config', JSON.stringify(config));
  }),
  getBranches: vi.fn(async () => ['main']),
  getRemoteStatus: vi.fn(async () => ({ hasUpdates: false, behind: 0, branch: 'main' })),
}));

describe('Settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows and saves version and changelog path fields', async () => {
    render(<Settings />);

    const versionInput = await screen.findByLabelText('版本文件路径');
    const changelogInput = screen.getByLabelText('更新日志路径');

    expect(versionInput).toHaveValue('release.log');
    expect(changelogInput).toHaveValue('CHANGELOG.md');

    fireEvent.change(versionInput, { target: { value: 'custom/release.log' } });
    fireEvent.change(changelogInput, { target: { value: 'docs/CHANGELOG.md' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      const stored = localStorage.getItem('git-updater-config');

      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.versionFilePath).toBe('custom/release.log');
      expect(parsed.changelogFilePath).toBe('docs/CHANGELOG.md');
    });
  });
});
