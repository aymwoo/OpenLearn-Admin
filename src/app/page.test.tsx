import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import Dashboard from './page';

vi.mock('@/lib/sys', () => ({
  getSystemInfo: vi.fn(async () => ({
    uptime: 100000,
    cpuUsage: 12,
    memoryTotal: 1024 * 1024 * 1024 * 16,
    memoryUsed: 1024 * 1024 * 1024 * 8,
    diskTotal: 1024 * 1024 * 1024 * 1024 * 2,
    diskAvailable: 1024 * 1024 * 1024 * 1024,
  })),
}));

vi.mock('@/lib/git', () => ({
  loadConfig: vi.fn(async () => null),
  getDashboardData: vi.fn(async () => ({})),
  getRemoteStatus: vi.fn(async () => ({})),
  listenPullProgress: vi.fn(async (handler) => { return () => {}; }),
}));

describe('Dashboard', () => {
  it('renders correctly', async () => {
    render(<Dashboard />);

    expect(await screen.findByText('本地版本')).toBeInTheDocument();
    expect(screen.getByText('远程版本')).toBeInTheDocument();
    expect(screen.getByText('remote log')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start Service' }));

    await waitFor(() => {
      expect(screen.getAllByText('当前已是最新版本').length).toBeGreaterThan(0);
    });
  });
});
