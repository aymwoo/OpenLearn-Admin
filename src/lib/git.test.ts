import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cloneRepo } from './git';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('git', () => {
  describe('cloneRepo', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should call invoke with correct arguments', async () => {
      const url = 'https://github.com/test/test.git';
      const path = '/local/path';
      const branch = 'main';

      vi.mocked(invoke).mockResolvedValueOnce('Success');

      await cloneRepo(url, path, branch);

      expect(invoke).toHaveBeenCalledWith('git_clone', { url, path, branch });
    });

    it('should use default branch when not provided', async () => {
      const url = 'https://github.com/test/test.git';
      const path = '/local/path';

      vi.mocked(invoke).mockResolvedValueOnce('Success');

      await cloneRepo(url, path);

      expect(invoke).toHaveBeenCalledWith('git_clone', { url, path, branch: 'main' });
    });

    it('should throw when invoke fails', async () => {
      const url = 'https://github.com/test/test.git';
      const path = '/local/path';

      const error = new Error('Clone failed');
      vi.mocked(invoke).mockRejectedValueOnce(error);

      await expect(cloneRepo(url, path)).rejects.toThrow('Clone failed');
    });
  });
});
