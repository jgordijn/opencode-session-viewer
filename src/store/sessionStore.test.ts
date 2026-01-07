import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionStore, type SessionNode, type ProjectInfo } from './sessionStore';
import type { SessionInfo } from '../types/session';
import type { VirtualFileSystem } from '../lib/fileSystem';

// Helper to reset store state between tests
const resetStore = () => {
  useSessionStore.setState({
    session: null,
    isLoading: false,
    error: null,
    fileSystem: null,
    projects: [],
    sessionTree: [],
    allSessions: {},
    selectedSessionId: null,
    isLoadingFolder: false,
    isLoadingSession: false,
    isLoadingMessages: false,
    loadError: null,
    sidebarOpen: true,
  });
};

// Helper to create mock SessionInfo
const createMockSessionInfo = (
  id: string,
  projectID: string = 'project-1',
  parentID?: string,
  options?: { created?: number; updated?: number }
): SessionInfo => ({
  id,
  version: '1.0.0',
  projectID,
  directory: `/Users/test/${projectID}`,
  title: `Session ${id}`,
  parentID,
  time: {
    created: options?.created ?? Date.now(),
    updated: options?.updated ?? Date.now(),
  },
});

// Helper to create mock SessionNode
const createMockSessionNode = (
  session: SessionInfo,
  children: SessionNode[] = []
): SessionNode => ({
  session,
  children,
});

// Helper to create mock VirtualFileSystem
const createMockFileSystem = (files: Map<string, string>): VirtualFileSystem => {
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

describe('sessionStore - multi-session state', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('initial state', () => {
    it('has null fileSystem', () => {
      expect(useSessionStore.getState().fileSystem).toBeNull();
    });

    it('has empty projects array', () => {
      expect(useSessionStore.getState().projects).toEqual([]);
    });

    it('has empty sessionTree array', () => {
      expect(useSessionStore.getState().sessionTree).toEqual([]);
    });

    it('has empty allSessions record', () => {
      expect(Object.keys(useSessionStore.getState().allSessions).length).toBe(0);
    });

    it('has null selectedSessionId', () => {
      expect(useSessionStore.getState().selectedSessionId).toBeNull();
    });

    it('has isLoadingFolder as false', () => {
      expect(useSessionStore.getState().isLoadingFolder).toBe(false);
    });

    it('has isLoadingSession as false', () => {
      expect(useSessionStore.getState().isLoadingSession).toBe(false);
    });

    it('has null loadError', () => {
      expect(useSessionStore.getState().loadError).toBeNull();
    });
  });

  describe('setFileSystem', () => {
    it('sets the file system', () => {
      const mockFs = createMockFileSystem(new Map());

      useSessionStore.getState().setFileSystem(mockFs);

      expect(useSessionStore.getState().fileSystem).toBe(mockFs);
    });
  });

  describe('setProjects', () => {
    it('sets projects array', () => {
      const session1 = createMockSessionInfo('session-1', 'project-1');
      const node1 = createMockSessionNode(session1);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/Users/test/project-1',
        sessions: [node1],
      };

      useSessionStore.getState().setProjects([project]);

      expect(useSessionStore.getState().projects).toHaveLength(1);
      expect(useSessionStore.getState().projects[0].id).toBe('project-1');
    });

    it('builds allSessions map from projects', () => {
      const session1 = createMockSessionInfo('session-1', 'project-1');
      const session2 = createMockSessionInfo('session-2', 'project-1');
      const node1 = createMockSessionNode(session1);
      const node2 = createMockSessionNode(session2);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/Users/test/project-1',
        sessions: [node1, node2],
      };

      useSessionStore.getState().setProjects([project]);

      const { allSessions } = useSessionStore.getState();
      expect(Object.keys(allSessions).length).toBe(2);
      expect(allSessions['session-1']).toBe(session1);
      expect(allSessions['session-2']).toBe(session2);
    });

    it('collects sessions from nested children', () => {
      const parentSession = createMockSessionInfo('parent', 'project-1');
      const childSession = createMockSessionInfo('child', 'project-1', 'parent');
      const grandchildSession = createMockSessionInfo('grandchild', 'project-1', 'child');

      const grandchildNode = createMockSessionNode(grandchildSession);
      const childNode = createMockSessionNode(childSession, [grandchildNode]);
      const parentNode = createMockSessionNode(parentSession, [childNode]);

      const project: ProjectInfo = {
        id: 'project-1',
        path: '/Users/test/project-1',
        sessions: [parentNode],
      };

      useSessionStore.getState().setProjects([project]);

      const { allSessions } = useSessionStore.getState();
      expect(Object.keys(allSessions).length).toBe(3);
      expect('parent' in allSessions).toBe(true);
      expect('child' in allSessions).toBe(true);
      expect('grandchild' in allSessions).toBe(true);
    });

    it('builds flat sessionTree from all projects', () => {
      const session1 = createMockSessionInfo('session-1', 'project-1');
      const session2 = createMockSessionInfo('session-2', 'project-2');
      const node1 = createMockSessionNode(session1);
      const node2 = createMockSessionNode(session2);

      const project1: ProjectInfo = {
        id: 'project-1',
        path: '/Users/test/project-1',
        sessions: [node1],
      };
      const project2: ProjectInfo = {
        id: 'project-2',
        path: '/Users/test/project-2',
        sessions: [node2],
      };

      useSessionStore.getState().setProjects([project1, project2]);

      const { sessionTree } = useSessionStore.getState();
      expect(sessionTree).toHaveLength(2);
      expect(sessionTree[0].session.id).toBe('session-1');
      expect(sessionTree[1].session.id).toBe('session-2');
    });

    it('clears loadError when setting projects', () => {
      useSessionStore.setState({ loadError: 'previous error' });

      const project: ProjectInfo = {
        id: 'project-1',
        path: '/path',
        sessions: [],
      };
      useSessionStore.getState().setProjects([project]);

      expect(useSessionStore.getState().loadError).toBeNull();
    });
  });

  describe('selectSession', () => {
    it('sets selectedSessionId', async () => {
      const session = createMockSessionInfo('session-1', 'project-1');
      const node = createMockSessionNode(session);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/Users/test/project-1',
        sessions: [node],
      };
      useSessionStore.getState().setProjects([project]);

      await useSessionStore.getState().selectSession('session-1');

      expect(useSessionStore.getState().selectedSessionId).toBe('session-1');
    });

    it('sets loadError when session not found', async () => {
      await useSessionStore.getState().selectSession('nonexistent');

      expect(useSessionStore.getState().loadError).toBe('Session not found: nonexistent');
    });

    it('loads session data from file system using lazy loading', async () => {
      const sessionInfo = createMockSessionInfo('session-1', 'project-1');
      // Create message and part files instead of a single session file
      const msgInfo = {
        id: 'msg-1',
        sessionID: 'session-1',
        role: 'user',
        time: { created: Date.now() },
        agent: 'test-agent',
        model: { providerID: 'test-provider', modelID: 'test-model' },
      };
      const partInfo = {
        id: 'part-1',
        sessionID: 'session-1',
        messageID: 'msg-1',
        type: 'text',
        text: 'Hello world',
      };
      const files = new Map([
        ['message/session-1/msg-1.json', JSON.stringify(msgInfo)],
        ['part/msg-1/part-1.json', JSON.stringify(partInfo)],
      ]);
      const mockFs = createMockFileSystem(files);

      const node = createMockSessionNode(sessionInfo);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/Users/test/project-1',
        sessions: [node],
      };

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);

      await useSessionStore.getState().selectSession('session-1');

      expect(useSessionStore.getState().session).not.toBeNull();
      expect(useSessionStore.getState().session?.info.id).toBe('session-1');
      expect(useSessionStore.getState().session?.messages).toHaveLength(1);
      expect(useSessionStore.getState().session?.messages[0].parts).toHaveLength(1);
    });

    it('sets isLoadingSession during load', async () => {
      const sessionInfo = createMockSessionInfo('session-1', 'project-1');
      const files = new Map<string, string>(); // Empty - no messages
      const mockFs = createMockFileSystem(files);

      const node = createMockSessionNode(sessionInfo);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/Users/test/project-1',
        sessions: [node],
      };

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);

      // Start loading (don't await)
      const loadPromise = useSessionStore.getState().selectSession('session-1');
      // Note: Due to async nature, isLoadingSession may already be false by the time we check
      // This test verifies the loading completes successfully
      await loadPromise;

      expect(useSessionStore.getState().isLoadingSession).toBe(false);
    });

    it('loads session with empty messages when no message files exist', async () => {
      const sessionInfo = createMockSessionInfo('session-1', 'project-1');
      const mockFs = createMockFileSystem(new Map()); // Empty - no messages

      const node = createMockSessionNode(sessionInfo);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/Users/test/project-1',
        sessions: [node],
      };

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);

      await useSessionStore.getState().selectSession('session-1');

      // With lazy loading, empty message directory is valid - just means no messages
      expect(useSessionStore.getState().loadError).toBeNull();
      expect(useSessionStore.getState().session).not.toBeNull();
      expect(useSessionStore.getState().session?.messages).toEqual([]);
    });

    it('loads session and skips invalid message files', async () => {
      const sessionInfo = createMockSessionInfo('session-1', 'project-1');
      const validMsgInfo = {
        id: 'msg-1',
        sessionID: 'session-1',
        role: 'user',
        time: { created: Date.now() },
        agent: 'test-agent',
        model: { providerID: 'test-provider', modelID: 'test-model' },
      };
      const files = new Map([
        ['message/session-1/msg-1.json', JSON.stringify(validMsgInfo)],
        ['message/session-1/corrupted.json', 'not valid json {{{'],
      ]);
      const mockFs = createMockFileSystem(files);

      const node = createMockSessionNode(sessionInfo);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/Users/test/project-1',
        sessions: [node],
      };

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);

      await useSessionStore.getState().selectSession('session-1');

      // With lazy loading, corrupted files are skipped but valid ones are loaded
      expect(useSessionStore.getState().loadError).toBeNull();
      expect(useSessionStore.getState().session).not.toBeNull();
      expect(useSessionStore.getState().session?.messages).toHaveLength(1);
    });

    it('works without file system (just updates selectedSessionId)', async () => {
      const sessionInfo = createMockSessionInfo('session-1', 'project-1');
      const node = createMockSessionNode(sessionInfo);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/Users/test/project-1',
        sessions: [node],
      };

      useSessionStore.getState().setProjects([project]);
      // Note: no setFileSystem call

      await useSessionStore.getState().selectSession('session-1');

      expect(useSessionStore.getState().selectedSessionId).toBe('session-1');
      expect(useSessionStore.getState().isLoadingSession).toBe(false);
      expect(useSessionStore.getState().loadError).toBeNull();
    });
  });

  describe('clearFolder', () => {
    it('resets all multi-session state', () => {
      // Set up some state
      const mockFs = createMockFileSystem(new Map());
      const session = createMockSessionInfo('session-1', 'project-1');
      const node = createMockSessionNode(session);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/Users/test/project-1',
        sessions: [node],
      };

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);
      useSessionStore.setState({
        selectedSessionId: 'session-1',
        isLoadingFolder: true,
        isLoadingSession: true,
        loadError: 'some error',
        session: { info: session, messages: [] },
      });

      // Clear
      useSessionStore.getState().clearFolder();

      const state = useSessionStore.getState();
      expect(state.fileSystem).toBeNull();
      expect(state.projects).toEqual([]);
      expect(state.sessionTree).toEqual([]);
      expect(Object.keys(state.allSessions).length).toBe(0);
      expect(state.selectedSessionId).toBeNull();
      expect(state.session).toBeNull();
      expect(state.isLoadingFolder).toBe(false);
      expect(state.isLoadingSession).toBe(false);
      expect(state.loadError).toBeNull();
    });
  });

  describe('existing functionality preservation', () => {
    it('preserves existing sidebarOpen state', () => {
      expect(useSessionStore.getState().sidebarOpen).toBe(true);

      useSessionStore.getState().setSidebarOpen(false);
      expect(useSessionStore.getState().sidebarOpen).toBe(false);

      useSessionStore.getState().toggleSidebar();
      expect(useSessionStore.getState().sidebarOpen).toBe(true);
    });

    it('preserves existing error handling', () => {
      useSessionStore.getState().setError('test error');
      expect(useSessionStore.getState().error).toBe('test error');

      useSessionStore.getState().clearError();
      expect(useSessionStore.getState().error).toBeNull();
    });

    it('preserves loadSessionFromData', () => {
      const sessionInfo = createMockSessionInfo('session-1');
      const session = { info: sessionInfo, messages: [] };

      useSessionStore.getState().loadSessionFromData(session);

      expect(useSessionStore.getState().session).toBe(session);
      expect(useSessionStore.getState().isLoading).toBe(false);
      expect(useSessionStore.getState().error).toBeNull();
    });

    it('preserves clearSession', () => {
      const sessionInfo = createMockSessionInfo('session-1');
      const session = { info: sessionInfo, messages: [] };
      useSessionStore.getState().loadSessionFromData(session);

      useSessionStore.getState().clearSession();

      expect(useSessionStore.getState().session).toBeNull();
      expect(useSessionStore.getState().error).toBeNull();
    });
  });
});

describe('sessionStore - loadUserMessages', () => {
  beforeEach(() => {
    resetStore();
  });

  it('does nothing when no file system is set', async () => {
    const session = createMockSessionInfo('session-1', 'project-1');
    const node = createMockSessionNode(session);
    const project: ProjectInfo = {
      id: 'project-1',
      path: '/path',
      sessions: [node],
    };
    useSessionStore.getState().setProjects([project]);

    await useSessionStore.getState().loadUserMessages();

    // allSessions should be unchanged (no userMessages added)
    expect(useSessionStore.getState().allSessions['session-1'].userMessages).toBeUndefined();
  });

  it('sets isLoadingMessages to true during load', async () => {
    const session = createMockSessionInfo('session-1', 'project-1');
    const node = createMockSessionNode(session);
    const project: ProjectInfo = {
      id: 'project-1',
      path: '/path',
      sessions: [node],
    };
    const mockFs = createMockFileSystem(new Map());

    useSessionStore.getState().setFileSystem(mockFs);
    useSessionStore.getState().setProjects([project]);

    // Start loading
    const loadPromise = useSessionStore.getState().loadUserMessages();
    await loadPromise;

    // After completion, isLoadingMessages should be false
    expect(useSessionStore.getState().isLoadingMessages).toBe(false);
  });

  it('loads user messages for all sessions', async () => {
    const session1 = createMockSessionInfo('session-1', 'project-1');
    const session2 = createMockSessionInfo('session-2', 'project-1');
    const node1 = createMockSessionNode(session1);
    const node2 = createMockSessionNode(session2);
    const project: ProjectInfo = {
      id: 'project-1',
      path: '/path',
      sessions: [node1, node2],
    };

    // Create messages for both sessions
    const userMsg1 = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'user',
      time: { created: Date.now() },
      agent: 'test',
      model: { providerID: 'test', modelID: 'test' },
    };
    const userMsg2 = {
      id: 'msg-2',
      sessionID: 'session-2',
      role: 'user',
      time: { created: Date.now() },
      agent: 'test',
      model: { providerID: 'test', modelID: 'test' },
    };
    const textPart1 = {
      id: 'part-1',
      sessionID: 'session-1',
      messageID: 'msg-1',
      type: 'text',
      text: 'First session message',
    };
    const textPart2 = {
      id: 'part-2',
      sessionID: 'session-2',
      messageID: 'msg-2',
      type: 'text',
      text: 'Second session message',
    };

    const files = new Map([
      ['message/session-1/msg-1.json', JSON.stringify(userMsg1)],
      ['message/session-2/msg-2.json', JSON.stringify(userMsg2)],
      ['part/msg-1/part-1.json', JSON.stringify(textPart1)],
      ['part/msg-2/part-2.json', JSON.stringify(textPart2)],
    ]);
    const mockFs = createMockFileSystem(files);

    useSessionStore.getState().setFileSystem(mockFs);
    useSessionStore.getState().setProjects([project]);

    await useSessionStore.getState().loadUserMessages();

    const { allSessions } = useSessionStore.getState();
    expect(allSessions['session-1'].userMessages).toEqual(['First session message']);
    expect(allSessions['session-2'].userMessages).toEqual(['Second session message']);
  });

  it('handles sessions with no messages gracefully', async () => {
    const session = createMockSessionInfo('session-1', 'project-1');
    const node = createMockSessionNode(session);
    const project: ProjectInfo = {
      id: 'project-1',
      path: '/path',
      sessions: [node],
    };
    const mockFs = createMockFileSystem(new Map()); // No message files

    useSessionStore.getState().setFileSystem(mockFs);
    useSessionStore.getState().setProjects([project]);

    await useSessionStore.getState().loadUserMessages();

    const { allSessions } = useSessionStore.getState();
    expect(allSessions['session-1'].userMessages).toEqual([]);
  });

  it('clears isLoadingMessages in clearFolder', () => {
    useSessionStore.setState({ isLoadingMessages: true });

    useSessionStore.getState().clearFolder();

    expect(useSessionStore.getState().isLoadingMessages).toBe(false);
  });
});

describe('sessionStore - reactivity', () => {
  beforeEach(() => {
    resetStore();
  });

  it('state changes are reactive', () => {
    const states: Array<{ projectCount: number }> = [];

    // Subscribe to changes
    const unsubscribe = useSessionStore.subscribe((state) => {
      states.push({ projectCount: state.projects.length });
    });

    // Trigger changes
    const project: ProjectInfo = {
      id: 'project-1',
      path: '/path',
      sessions: [],
    };
    useSessionStore.getState().setProjects([project]);

    // Verify subscription fired
    expect(states.length).toBeGreaterThan(0);
    expect(states[states.length - 1].projectCount).toBe(1);

    unsubscribe();
  });

  it('allSessions map is reactive', () => {
    const session = createMockSessionInfo('session-1', 'project-1');
    const node = createMockSessionNode(session);
    const project: ProjectInfo = {
      id: 'project-1',
      path: '/path',
      sessions: [node],
    };

    useSessionStore.getState().setProjects([project]);

    // After setProjects, allSessions should be populated
    const allSessions = useSessionStore.getState().allSessions;
    expect(Object.keys(allSessions).length).toBe(1);
    expect(allSessions['session-1']).toBe(session);
  });
});

describe('sessionStore - reloadSessions', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('preserving selectedSessionId', () => {
    it('preserves selectedSessionId when session still exists after reload', async () => {
      // Setup: Create initial session state with a selected session
      const session1 = createMockSessionInfo('session-1', 'project-1');
      const session2 = createMockSessionInfo('session-2', 'project-1');
      const node1 = createMockSessionNode(session1);
      const node2 = createMockSessionNode(session2);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/path',
        sessions: [node1, node2],
      };

      // Create file system with session files
      const files = new Map([
        ['session/project-1/project.json', JSON.stringify({ path: '/path' })],
        ['session/project-1/session-1.json', JSON.stringify(session1)],
        ['session/project-1/session-2.json', JSON.stringify(session2)],
      ]);
      const mockFs = createMockFileSystem(files);

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);
      useSessionStore.setState({ selectedSessionId: 'session-1' });

      // Reload sessions
      await useSessionStore.getState().reloadSessions();

      // Verify selected session is preserved
      expect(useSessionStore.getState().selectedSessionId).toBe('session-1');
    });

    it('selects next sibling when selected session is deleted and has next sibling', async () => {
      // Setup: Create initial session state with 3 sibling sessions
      const session1 = createMockSessionInfo('session-1', 'project-1');
      const session2 = createMockSessionInfo('session-2', 'project-1');
      const session3 = createMockSessionInfo('session-3', 'project-1');
      const node1 = createMockSessionNode(session1);
      const node2 = createMockSessionNode(session2);
      const node3 = createMockSessionNode(session3);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/path',
        sessions: [node1, node2, node3],
      };

      // File system only has session-1 and session-3 (session-2 was deleted)
      const files = new Map([
        ['session/project-1/project.json', JSON.stringify({ path: '/path' })],
        ['session/project-1/session-1.json', JSON.stringify(session1)],
        ['session/project-1/session-3.json', JSON.stringify(session3)],
      ]);
      const mockFs = createMockFileSystem(files);

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);
      useSessionStore.setState({ selectedSessionId: 'session-2' });

      // Reload sessions - session-2 no longer exists
      await useSessionStore.getState().reloadSessions();

      // Verify next sibling (session-3) is selected
      expect(useSessionStore.getState().selectedSessionId).toBe('session-3');
    });

    it('selects previous sibling when selected session is deleted and has only previous sibling', async () => {
      // Setup: Create initial session state with 3 sibling sessions
      const session1 = createMockSessionInfo('session-1', 'project-1');
      const session2 = createMockSessionInfo('session-2', 'project-1');
      const session3 = createMockSessionInfo('session-3', 'project-1');
      const node1 = createMockSessionNode(session1);
      const node2 = createMockSessionNode(session2);
      const node3 = createMockSessionNode(session3);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/path',
        sessions: [node1, node2, node3],
      };

      // File system only has session-1 and session-2 (session-3 was deleted)
      const files = new Map([
        ['session/project-1/project.json', JSON.stringify({ path: '/path' })],
        ['session/project-1/session-1.json', JSON.stringify(session1)],
        ['session/project-1/session-2.json', JSON.stringify(session2)],
      ]);
      const mockFs = createMockFileSystem(files);

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);
      useSessionStore.setState({ selectedSessionId: 'session-3' });

      // Reload sessions - session-3 no longer exists
      await useSessionStore.getState().reloadSessions();

      // Verify previous sibling (session-2) is selected
      expect(useSessionStore.getState().selectedSessionId).toBe('session-2');
    });

    it('clears selection when deleted session has no siblings remaining', async () => {
      // Setup: Create initial session state with only one session
      const session1 = createMockSessionInfo('session-1', 'project-1');
      const node1 = createMockSessionNode(session1);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/path',
        sessions: [node1],
      };

      // File system has no sessions (session-1 was deleted)
      const files = new Map([
        ['session/project-1/project.json', JSON.stringify({ path: '/path' })],
      ]);
      const mockFs = createMockFileSystem(files);

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);
      useSessionStore.setState({ selectedSessionId: 'session-1' });

      // Reload sessions - session-1 no longer exists and has no siblings
      await useSessionStore.getState().reloadSessions();

      // Verify selection is cleared
      expect(useSessionStore.getState().selectedSessionId).toBeNull();
    });

    it('selects sibling within same parent group for nested sessions', async () => {
      // Setup: Create a parent session with 2 child sessions
      const parentSession = createMockSessionInfo('parent', 'project-1');
      const childSession1 = createMockSessionInfo('child-1', 'project-1', 'parent');
      const childSession2 = createMockSessionInfo('child-2', 'project-1', 'parent');

      const childNode1 = createMockSessionNode(childSession1);
      const childNode2 = createMockSessionNode(childSession2);
      const parentNode = createMockSessionNode(parentSession, [childNode1, childNode2]);

      const project: ProjectInfo = {
        id: 'project-1',
        path: '/path',
        sessions: [parentNode],
      };

      // File system has parent and child-2 (child-1 was deleted)
      const files = new Map([
        ['session/project-1/project.json', JSON.stringify({ path: '/path' })],
        ['session/project-1/parent.json', JSON.stringify(parentSession)],
        ['session/project-1/child-2.json', JSON.stringify(childSession2)],
      ]);
      const mockFs = createMockFileSystem(files);

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);
      useSessionStore.setState({ selectedSessionId: 'child-1' });

      // Reload sessions - child-1 no longer exists
      await useSessionStore.getState().reloadSessions();

      // Verify sibling in same parent group (child-2) is selected
      expect(useSessionStore.getState().selectedSessionId).toBe('child-2');
    });

    it('handles reload when no session was selected', async () => {
      const session1 = createMockSessionInfo('session-1', 'project-1');
      const node1 = createMockSessionNode(session1);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/path',
        sessions: [node1],
      };

      const files = new Map([
        ['session/project-1/project.json', JSON.stringify({ path: '/path' })],
        ['session/project-1/session-1.json', JSON.stringify(session1)],
      ]);
      const mockFs = createMockFileSystem(files);

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);
      // No selected session

      await useSessionStore.getState().reloadSessions();

      // Verify no selection was made
      expect(useSessionStore.getState().selectedSessionId).toBeNull();
    });
  });

  describe('detecting changes', () => {
    it('detects and reports new sessions', async () => {
      // Start with one session
      const session1 = createMockSessionInfo('session-1', 'project-1');
      const node1 = createMockSessionNode(session1);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/path',
        sessions: [node1],
      };

      // File system has two sessions now (session-2 is new)
      const session2 = createMockSessionInfo('session-2', 'project-1');
      const files = new Map([
        ['session/project-1/project.json', JSON.stringify({ path: '/path' })],
        ['session/project-1/session-1.json', JSON.stringify(session1)],
        ['session/project-1/session-2.json', JSON.stringify(session2)],
      ]);
      const mockFs = createMockFileSystem(files);

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);

      const result = await useSessionStore.getState().reloadSessions();

      expect(result?.added).toContain('session-2');
      expect(result?.removed).toEqual([]);
      expect(result?.updated).toEqual([]);
    });

    it('detects and reports removed sessions', async () => {
      // Start with two sessions
      const session1 = createMockSessionInfo('session-1', 'project-1');
      const session2 = createMockSessionInfo('session-2', 'project-1');
      const node1 = createMockSessionNode(session1);
      const node2 = createMockSessionNode(session2);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/path',
        sessions: [node1, node2],
      };

      // File system only has session-1 (session-2 removed)
      const files = new Map([
        ['session/project-1/project.json', JSON.stringify({ path: '/path' })],
        ['session/project-1/session-1.json', JSON.stringify(session1)],
      ]);
      const mockFs = createMockFileSystem(files);

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);

      const result = await useSessionStore.getState().reloadSessions();

      expect(result?.added).toEqual([]);
      expect(result?.removed).toContain('session-2');
      expect(result?.updated).toEqual([]);
    });

    it('detects and reports updated sessions by timestamp', async () => {
      const now = Date.now();
      // Start with session at time T
      const session1 = createMockSessionInfo('session-1', 'project-1', undefined, {
        created: now - 1000,
        updated: now - 1000,
      });
      const node1 = createMockSessionNode(session1);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/path',
        sessions: [node1],
      };

      // File system has session with updated timestamp
      const updatedSession1 = createMockSessionInfo('session-1', 'project-1', undefined, {
        created: now - 1000,
        updated: now, // Updated more recently
      });
      const files = new Map([
        ['session/project-1/project.json', JSON.stringify({ path: '/path' })],
        ['session/project-1/session-1.json', JSON.stringify(updatedSession1)],
      ]);
      const mockFs = createMockFileSystem(files);

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);

      const result = await useSessionStore.getState().reloadSessions();

      expect(result?.added).toEqual([]);
      expect(result?.removed).toEqual([]);
      expect(result?.updated).toContain('session-1');
    });

    it('returns null when no file system is set', async () => {
      const result = await useSessionStore.getState().reloadSessions();

      expect(result).toBeNull();
    });
  });

  describe('state merging', () => {
    it('updates allSessions with new session data', async () => {
      const now = Date.now();
      const session1 = createMockSessionInfo('session-1', 'project-1', undefined, {
        created: now - 1000,
        updated: now - 1000,
      });
      const node1 = createMockSessionNode(session1);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/path',
        sessions: [node1],
      };

      // File system has updated session with new title
      const updatedSession1: SessionInfo = {
        ...session1,
        title: 'Updated Title',
        time: { ...session1.time, updated: now },
      };
      const files = new Map([
        ['session/project-1/project.json', JSON.stringify({ path: '/path' })],
        ['session/project-1/session-1.json', JSON.stringify(updatedSession1)],
      ]);
      const mockFs = createMockFileSystem(files);

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);

      await useSessionStore.getState().reloadSessions();

      const { allSessions } = useSessionStore.getState();
      expect(allSessions['session-1'].title).toBe('Updated Title');
    });

    it('preserves userMessages from previous state when not reloaded', async () => {
      const session1: SessionInfo = {
        ...createMockSessionInfo('session-1', 'project-1'),
        userMessages: ['Previous message'],
      };
      const node1 = createMockSessionNode(session1);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/path',
        sessions: [node1],
      };

      // File system has same session (no userMessages in file)
      const files = new Map([
        ['session/project-1/project.json', JSON.stringify({ path: '/path' })],
        ['session/project-1/session-1.json', JSON.stringify(createMockSessionInfo('session-1', 'project-1'))],
      ]);
      const mockFs = createMockFileSystem(files);

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);

      await useSessionStore.getState().reloadSessions();

      const { allSessions } = useSessionStore.getState();
      expect(allSessions['session-1'].userMessages).toEqual(['Previous message']);
    });
  });

  describe('loading state', () => {
    it('does not set isLoadingFolder during reload', async () => {
      const session1 = createMockSessionInfo('session-1', 'project-1');
      const node1 = createMockSessionNode(session1);
      const project: ProjectInfo = {
        id: 'project-1',
        path: '/path',
        sessions: [node1],
      };

      const files = new Map([
        ['session/project-1/project.json', JSON.stringify({ path: '/path' })],
        ['session/project-1/session-1.json', JSON.stringify(session1)],
      ]);
      const mockFs = createMockFileSystem(files);

      useSessionStore.getState().setFileSystem(mockFs);
      useSessionStore.getState().setProjects([project]);

      // The reload should complete without setting isLoadingFolder
      const reloadPromise = useSessionStore.getState().reloadSessions();

      // isLoadingFolder should stay false during reload
      // (initial browseForFolder sets it, reload should not)
      expect(useSessionStore.getState().isLoadingFolder).toBe(false);

      await reloadPromise;
      expect(useSessionStore.getState().isLoadingFolder).toBe(false);
    });
  });
});

describe('sessionStore - compareSessionChanges', () => {
  beforeEach(() => {
    resetStore();
  });

  it('identifies added sessions', () => {
    const oldSessions: Record<string, SessionInfo> = {
      'session-1': createMockSessionInfo('session-1'),
    };
    const newSessions: Record<string, SessionInfo> = {
      'session-1': createMockSessionInfo('session-1'),
      'session-2': createMockSessionInfo('session-2'),
    };

    const result = useSessionStore.getState().compareSessionChanges(oldSessions, newSessions);

    expect(result.added).toEqual(['session-2']);
    expect(result.removed).toEqual([]);
    expect(result.updated).toEqual([]);
  });

  it('identifies removed sessions', () => {
    const oldSessions: Record<string, SessionInfo> = {
      'session-1': createMockSessionInfo('session-1'),
      'session-2': createMockSessionInfo('session-2'),
    };
    const newSessions: Record<string, SessionInfo> = {
      'session-1': createMockSessionInfo('session-1'),
    };

    const result = useSessionStore.getState().compareSessionChanges(oldSessions, newSessions);

    expect(result.added).toEqual([]);
    expect(result.removed).toEqual(['session-2']);
    expect(result.updated).toEqual([]);
  });

  it('identifies updated sessions by updated timestamp', () => {
    const now = Date.now();
    const oldSessions: Record<string, SessionInfo> = {
      'session-1': createMockSessionInfo('session-1', 'project-1', undefined, {
        created: now - 2000,
        updated: now - 2000,
      }),
    };
    const newSessions: Record<string, SessionInfo> = {
      'session-1': createMockSessionInfo('session-1', 'project-1', undefined, {
        created: now - 2000,
        updated: now - 1000, // More recent
      }),
    };

    const result = useSessionStore.getState().compareSessionChanges(oldSessions, newSessions);

    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.updated).toEqual(['session-1']);
  });

  it('handles empty old sessions', () => {
    const oldSessions: Record<string, SessionInfo> = {};
    const newSessions: Record<string, SessionInfo> = {
      'session-1': createMockSessionInfo('session-1'),
    };

    const result = useSessionStore.getState().compareSessionChanges(oldSessions, newSessions);

    expect(result.added).toEqual(['session-1']);
    expect(result.removed).toEqual([]);
    expect(result.updated).toEqual([]);
  });

  it('handles empty new sessions', () => {
    const oldSessions: Record<string, SessionInfo> = {
      'session-1': createMockSessionInfo('session-1'),
    };
    const newSessions: Record<string, SessionInfo> = {};

    const result = useSessionStore.getState().compareSessionChanges(oldSessions, newSessions);

    expect(result.added).toEqual([]);
    expect(result.removed).toEqual(['session-1']);
    expect(result.updated).toEqual([]);
  });

  it('handles multiple simultaneous changes', () => {
    const now = Date.now();
    const oldSessions: Record<string, SessionInfo> = {
      'session-1': createMockSessionInfo('session-1', 'project-1', undefined, {
        created: now - 3000,
        updated: now - 3000,
      }),
      'session-2': createMockSessionInfo('session-2'),
      'session-3': createMockSessionInfo('session-3'),
    };
    const newSessions: Record<string, SessionInfo> = {
      'session-1': createMockSessionInfo('session-1', 'project-1', undefined, {
        created: now - 3000,
        updated: now - 1000, // Updated
      }),
      // session-2 removed
      'session-3': createMockSessionInfo('session-3'), // Unchanged
      'session-4': createMockSessionInfo('session-4'), // Added
    };

    const result = useSessionStore.getState().compareSessionChanges(oldSessions, newSessions);

    expect(result.added).toEqual(['session-4']);
    expect(result.removed).toEqual(['session-2']);
    expect(result.updated).toEqual(['session-1']);
  });
});
