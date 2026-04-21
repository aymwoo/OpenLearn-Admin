import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import Dashboard from './page';

vi.mock('@/lib/git', () => ({
  loadConfig: vi.fn(async () => ({
    remoteUrl: 'https://example.com/repo.git',
    localPath: '/repo',
    branch: 'main',
    forcePush: false,
    backupBeforePull: true,
    versionFilePath: 'release.log',
    changelogFilePath: 'CHANGELOG.md',
  })),
  getDashboardData: vi.fn(async () => ({
    status: { currentBranch: 'main', hasUpdates: true, localVersion: 'v1', remoteVersion: 'v2' },
    local: {
      version: 'v1',
      branch: 'main',
      lastFetchedAt: '2026-04-21 10:00:00',
      changelogSection: 'local log',
      source: 'local',
    },
    remote: {
      version: 'v2',
      branch: 'main',
      changelogSection: 'remote log',
      source: 'remote',
    },
  })),
  getRemoteStatus: vi.fn(async () => ({ hasUpdates: true, behind: 1, branch: 'main' })),
  backupRepo: vi.fn(async () => '/repo.backup'),
  pullRepo: vi.fn(async () => ({ success: true, message: 'Pull successful' })),
  runSmartPull: vi.fn(async () => ({
    updated: false,
    skipped: true,
    message: '当前已是最新版本',
    local: { version: 'v1', source: 'local', changelogSection: 'local log' },
    remote: { version: 'v1', source: 'remote', changelogSection: 'remote log' },
  })),
  listenPullProgress: vi.fn(async (handler) => {
    handler({ stage: 'checking', percent: 10, label: '检查远端版本' });
    return () => {};
  }),
}));

describe('Dashboard', () => {
  it('renders version comparison and staged progress state', async () => {
    render(<Dashboard />);

    expect(await screen.findByText('本地当前版本')).toBeInTheDocument();
    expect(screen.getByText('远端最新版本')).toBeInTheDocument();
    expect(screen.getByText('remote log')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '一键抓取' }));

    await waitFor(() => {
      expect(screen.getAllByText('当前已是最新版本').length).toBeGreaterThan(0);
    });
  });
});
