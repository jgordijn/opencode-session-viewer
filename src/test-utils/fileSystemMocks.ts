import { vi } from 'vitest';
import type { VirtualFileSystem } from '../lib/fileSystem';

/**
 * Creates a minimal VirtualFileSystem mock with stub functions.
 * Use this when you only need a truthy fileSystem value (e.g., to show/hide UI elements).
 */
export const createMinimalFileSystemMock = (): VirtualFileSystem => ({
  readFile: vi.fn(),
  listDirectory: vi.fn(),
  exists: vi.fn(),
});

/**
 * Creates a VirtualFileSystem mock backed by an in-memory file map.
 * Use this when you need the file system to return actual data during tests.
 *
 * @param files - Map of file paths (e.g., 'session/project-1/session.json') to their content
 */
export const createFileSystemMock = (files: Map<string, string>): VirtualFileSystem => {
  // Build set of directories for listing
  const directories = new Set<string>();
  directories.add(''); // root

  for (const filePath of files.keys()) {
    const segments = filePath.split('/');
    for (let i = 1; i < segments.length; i++) {
      directories.add(segments.slice(0, i).join('/'));
    }
  }

  return {
    readFile: vi.fn().mockImplementation(async (path: string[]) => {
      const pathString = path.join('/');
      return files.get(pathString) ?? null;
    }),
    listDirectory: vi.fn().mockImplementation(async (path: string[]) => {
      const pathString = path.join('/');

      // If path is a file, return empty
      if (files.has(pathString)) {
        return [];
      }

      // If path doesn't exist as a directory, return empty
      if (pathString !== '' && !directories.has(pathString)) {
        return [];
      }

      const prefix = pathString === '' ? '' : pathString + '/';
      const entries = new Set<string>();

      for (const filePath of files.keys()) {
        if (pathString === '' || filePath.startsWith(prefix)) {
          const relativePath = pathString === '' ? filePath : filePath.slice(prefix.length);
          const firstSegment = relativePath.split('/')[0];
          if (firstSegment) {
            entries.add(firstSegment);
          }
        }
      }

      return Array.from(entries);
    }),
    exists: vi.fn().mockImplementation(async (path: string[]) => {
      if (path.length === 0) return true;
      const pathString = path.join('/');
      return files.has(pathString) || directories.has(pathString);
    }),
  };
};
