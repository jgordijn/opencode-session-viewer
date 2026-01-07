import { create } from 'zustand';
import type { Session, SessionInfo } from '../types/session';
import { createFileSystemFromHandle, type VirtualFileSystem } from '../lib/fileSystem';
import { loadAllSessions, loadSessionContent, loadUserMessagesForSession } from '../lib/sessionLoader';

/**
 * Represents a session with its child sessions (for branched conversations).
 */
export interface SessionNode {
  session: SessionInfo;
  children: SessionNode[];
}

/**
 * Represents a project (directory) containing multiple sessions.
 */
export interface ProjectInfo {
  id: string;
  path: string; // e.g., '/Users/.../opencode'
  sessions: SessionNode[];
}

/**
 * Represents sessions grouped by their working directory.
 * Used for displaying sessions organized by directory in the UI.
 */
export interface DirectoryGroup {
  directory: string; // The working directory path
  sessions: SessionNode[]; // Root sessions with nested children, sorted by time descending
  latestUpdate: number; // Most recent update time (for sorting groups)
}

/**
 * Represents a day containing sessions.
 */
export interface DayGroup {
  day: number; // Day of month (1-31)
  label: string; // e.g., "15" or "Today"
  sessions: SessionNode[];
}

/**
 * Represents a month containing days.
 */
export interface MonthGroup {
  month: number; // Month (0-11)
  label: string; // e.g., "January"
  days: DayGroup[];
}

/**
 * Represents a year containing months.
 */
export interface YearGroup {
  year: number;
  label: string; // e.g., "2025"
  months: MonthGroup[];
}

/**
 * Result of comparing old and new session states.
 */
export interface SessionChanges {
  added: string[];
  removed: string[];
  updated: string[];
}

interface SessionState {
  // Session data (single session - existing)
  session: Session | null;
  isLoading: boolean;
  error: string | null;

  // Multi-session state
  fileSystem: VirtualFileSystem | null;
  projects: ProjectInfo[];
  sessionTree: SessionNode[];
  allSessions: Record<string, SessionInfo>;
  selectedSessionId: string | null;
  isLoadingFolder: boolean;
  isLoadingSession: boolean;
  isLoadingMessages: boolean;
  loadError: string | null;

  // UI state
  sidebarOpen: boolean;

  // Actions (existing - single file loading)
  loadSession: (file: File) => Promise<void>;
  loadSessionFromUrl: (url: string) => Promise<void>;
  loadSessionFromData: (data: Session) => void;
  clearSession: () => void;
  clearError: () => void;
  setError: (error: string) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Multi-session actions
  setFileSystem: (fs: VirtualFileSystem) => void;
  setProjects: (projects: ProjectInfo[]) => void;
  selectSession: (sessionId: string) => Promise<void>;
  loadUserMessages: () => Promise<void>;
  clearFolder: () => void;
  browseForFolder: () => Promise<void>;
  reloadSessions: () => Promise<SessionChanges | null>;
  compareSessionChanges: (
    oldSessions: Record<string, SessionInfo>,
    newSessions: Record<string, SessionInfo>
  ) => SessionChanges;
}

/**
 * Validates a URL for security before fetching.
 * Only allows https:// URLs to prevent SSRF-like attacks.
 */
function validateUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url, window.location.origin);
    
    // Allow relative URLs (same origin)
    if (url.startsWith('/') || url.startsWith('./')) {
      return { valid: true };
    }
    
    // For absolute URLs, only allow https (or http for localhost development)
    if (parsed.protocol === 'https:') {
      return { valid: true };
    }
    
    if (parsed.protocol === 'http:' && parsed.hostname === 'localhost') {
      return { valid: true };
    }
    
    return { 
      valid: false, 
      error: 'Only HTTPS URLs are allowed for security reasons' 
    };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validates parsed session data structure.
 */
function validateSessionData(data: unknown): data is Session {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  
  const obj = data as Record<string, unknown>;
  
  return (
    typeof obj.info === 'object' &&
    obj.info !== null &&
    Array.isArray(obj.messages)
  );
}

export const useSessionStore = create<SessionState>((set, get) => ({
  // Initial state (single session - existing)
  session: null,
  isLoading: false,
  error: null,

  // Multi-session state
  fileSystem: null,
  projects: [],
  sessionTree: [],
  allSessions: {},
  selectedSessionId: null,
  isLoadingFolder: false,
  isLoadingSession: false,
  isLoadingMessages: false,
  loadError: null,

  // UI state - sidebar visible by default
  sidebarOpen: true,

  // Load session from a File object
  loadSession: async (file: File) => {
    set({ isLoading: true, error: null });

    try {
      const text = await file.text();
      const data: unknown = JSON.parse(text);
      
      if (!validateSessionData(data)) {
        throw new Error('Invalid session format: missing info or messages');
      }

      set({ session: data, isLoading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load session';
      set({ isLoading: false, error: message });
    }
  },

  // Load session from a URL
  loadSessionFromUrl: async (url: string) => {
    // Validate URL before fetching
    const validation = validateUrl(url);
    if (!validation.valid) {
      set({ error: validation.error ?? 'Invalid URL' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }

      const data: unknown = await response.json();
      
      if (!validateSessionData(data)) {
        throw new Error('Invalid session format: missing info or messages');
      }

      set({ session: data, isLoading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load session';
      set({ isLoading: false, error: message });
    }
  },

  // Load session from already-parsed data
  loadSessionFromData: (data: Session) => {
    set({ session: data, isLoading: false, error: null });
  },

  // Clear the current session
  clearSession: () => {
    set({ session: null, error: null });
  },

  // Clear error state
  clearError: () => {
    set({ error: null });
  },

  // Set error state
  setError: (error: string) => {
    set({ error });
  },

  // Sidebar controls
  setSidebarOpen: (open: boolean) => {
    set({ sidebarOpen: open });
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  // Multi-session actions
  setFileSystem: (fs: VirtualFileSystem) => {
    set({ fileSystem: fs });
  },

  setProjects: (projects: ProjectInfo[]) => {
    // Build allSessions record from all projects
    const allSessions: Record<string, SessionInfo> = {};
    const collectSessions = (nodes: SessionNode[]) => {
      for (const node of nodes) {
        allSessions[node.session.id] = node.session;
        collectSessions(node.children);
      }
    };

    for (const project of projects) {
      collectSessions(project.sessions);
    }

    // Build flat sessionTree from all projects
    const sessionTree: SessionNode[] = projects.flatMap((p) => p.sessions);

    set({ projects, allSessions, sessionTree, loadError: null });
  },

  selectSession: async (sessionId: string) => {
    const state = get();
    const sessionInfo = state.allSessions[sessionId];

    if (!sessionInfo) {
      set({ loadError: `Session not found: ${sessionId}` });
      return;
    }

    set({ isLoadingSession: true, loadError: null, selectedSessionId: sessionId });

    try {
      // If we have a file system, load the full session data using lazy loading
      if (state.fileSystem) {
        const session = await loadSessionContent(
          sessionId,
          state.allSessions,
          state.fileSystem
        );

        // Check if user selected a different session while we were loading
        // If so, ignore this result to avoid race condition
        if (get().selectedSessionId !== sessionId) {
          return;
        }

        set({
          session,
          isLoadingSession: false,
          loadError: null,
        });
      } else {
        // No file system - just update the selected session ID
        set({ isLoadingSession: false });
      }
    } catch (err) {
      // Only update error if this is still the selected session
      if (get().selectedSessionId === sessionId) {
        const message = err instanceof Error ? err.message : 'Failed to load session';
        set({ isLoadingSession: false, loadError: message });
      }
    }
  },

  loadUserMessages: async () => {
    const state = get();
    if (!state.fileSystem) {
      return;
    }

    set({ isLoadingMessages: true });

    try {
      const updatedSessions: Record<string, SessionInfo> = {};

      // Load user messages for all sessions in parallel
      const sessionEntries = Object.entries(state.allSessions);
      const results = await Promise.all(
        sessionEntries.map(async ([sessionId, sessionInfo]) => {
          const userMessages = await loadUserMessagesForSession(sessionId, state.fileSystem!);
          return { sessionId, sessionInfo, userMessages };
        })
      );

      // Update sessions with loaded user messages
      for (const { sessionId, sessionInfo, userMessages } of results) {
        updatedSessions[sessionId] = {
          ...sessionInfo,
          userMessages,
        };
      }

      // Helper to update SessionNode tree with new session data
      const updateSessionTree = (nodes: SessionNode[]): SessionNode[] => {
        return nodes.map((node) => ({
          session: updatedSessions[node.session.id] ?? node.session,
          children: updateSessionTree(node.children),
        }));
      };

      // Update allSessions, sessionTree, and projects to keep them all in sync
      set({
        allSessions: updatedSessions,
        sessionTree: updateSessionTree(state.sessionTree),
        projects: state.projects.map((project) => ({
          ...project,
          sessions: updateSessionTree(project.sessions),
        })),
        isLoadingMessages: false,
      });
    } catch (err) {
      console.warn('Failed to load user messages:', err);
      set({ isLoadingMessages: false });
    }
  },

  clearFolder: () => {
    set({
      fileSystem: null,
      projects: [],
      sessionTree: [],
      allSessions: {},
      selectedSessionId: null,
      session: null,
      isLoadingFolder: false,
      isLoadingSession: false,
      isLoadingMessages: false,
      loadError: null,
    });
  },

  browseForFolder: async () => {
    // Check if File System Access API is supported
    if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
      return;
    }

    try {
      const directoryHandle = await window.showDirectoryPicker();
      const fs = createFileSystemFromHandle(directoryHandle);

      set({ fileSystem: fs, isLoadingFolder: true, loadError: null });

      // Load all sessions from the selected folder
      const result = await loadAllSessions(fs);

      // Build allSessions record from projects
      const allSessions: Record<string, SessionInfo> = {};
      const collectSessions = (nodes: SessionNode[]) => {
        for (const node of nodes) {
          allSessions[node.session.id] = node.session;
          collectSessions(node.children);
        }
      };

      for (const project of result.projects) {
        collectSessions(project.sessions);
      }

      // Build flat sessionTree from all projects
      const sessionTree: SessionNode[] = result.projects.flatMap((p) => p.sessions);

      set({
        projects: result.projects,
        sessionTree,
        allSessions,
        isLoadingFolder: false,
        loadError: null,
      });
    } catch (err) {
      // User cancelled the picker or an error occurred
      if (err instanceof Error && err.name !== 'AbortError') {
        set({ loadError: err.message, isLoadingFolder: false });
      } else {
        set({ isLoadingFolder: false });
      }
    }
  },

  compareSessionChanges: (
    oldSessions: Record<string, SessionInfo>,
    newSessions: Record<string, SessionInfo>
  ): SessionChanges => {
    const added: string[] = [];
    const removed: string[] = [];
    const updated: string[] = [];

    const oldIds = new Set(Object.keys(oldSessions));
    const newIds = new Set(Object.keys(newSessions));

    // Find added sessions
    for (const id of newIds) {
      if (!oldIds.has(id)) {
        added.push(id);
      }
    }

    // Find removed sessions
    for (const id of oldIds) {
      if (!newIds.has(id)) {
        removed.push(id);
      }
    }

    // Find updated sessions (by comparing updated timestamp)
    for (const id of newIds) {
      if (oldIds.has(id)) {
        const oldSession = oldSessions[id];
        const newSession = newSessions[id];
        if (newSession.time.updated !== oldSession.time.updated) {
          updated.push(id);
        }
      }
    }

    return { added, removed, updated };
  },

  reloadSessions: async (): Promise<SessionChanges | null> => {
    const state = get();
    if (!state.fileSystem) {
      return null;
    }

    // Capture current UI state before reload
    const previousSelectedSessionId = state.selectedSessionId;
    const previousSessions = state.allSessions;
    const previousSessionTree = state.sessionTree;

    // Find the sibling list for the selected session before reload
    let previousSiblings: string[] = [];
    let previousIndex = -1;
    if (previousSelectedSessionId) {
      const selectedSession = previousSessions[previousSelectedSessionId];
      if (selectedSession) {
        // Find siblings: sessions with the same parentID in the same tree level
        const findSiblings = (nodes: SessionNode[], parentID: string | undefined): string[] => {
          for (const node of nodes) {
            if (node.session.parentID === parentID) {
              // This level contains sessions with matching parentID
              // Collect all siblings at this level
              return nodes
                .filter((n) => n.session.parentID === parentID)
                .map((n) => n.session.id);
            }
            // Check children recursively
            const childResult = findSiblings(node.children, parentID);
            if (childResult.length > 0) {
              return childResult;
            }
          }
          return [];
        };

        previousSiblings = findSiblings(previousSessionTree, selectedSession.parentID);
        previousIndex = previousSiblings.indexOf(previousSelectedSessionId);
      }
    }

    try {
      // Load fresh session data
      const result = await loadAllSessions(state.fileSystem);

      // Build new allSessions record from projects
      const newAllSessions: Record<string, SessionInfo> = {};
      const collectSessions = (nodes: SessionNode[]) => {
        for (const node of nodes) {
          newAllSessions[node.session.id] = node.session;
          collectSessions(node.children);
        }
      };

      for (const project of result.projects) {
        collectSessions(project.sessions);
      }

      // Compare sessions to detect changes
      const changes = get().compareSessionChanges(previousSessions, newAllSessions);

      // Merge: preserve userMessages from previous state for sessions that still exist
      const mergedSessions: Record<string, SessionInfo> = {};
      for (const [id, sessionInfo] of Object.entries(newAllSessions)) {
        const previousSession = previousSessions[id];
        if (previousSession?.userMessages) {
          mergedSessions[id] = {
            ...sessionInfo,
            userMessages: previousSession.userMessages,
          };
        } else {
          mergedSessions[id] = sessionInfo;
        }
      }

      // Helper to update SessionNode tree with merged session data
      const updateSessionTree = (nodes: SessionNode[]): SessionNode[] => {
        return nodes.map((node) => ({
          session: mergedSessions[node.session.id] ?? node.session,
          children: updateSessionTree(node.children),
        }));
      };

      // Build updated sessionTree and projects with merged data
      const updatedProjects = result.projects.map((project) => ({
        ...project,
        sessions: updateSessionTree(project.sessions),
      }));
      const sessionTree: SessionNode[] = updatedProjects.flatMap((p) => p.sessions);

      // Determine new selectedSessionId
      let newSelectedSessionId: string | null = null;
      if (previousSelectedSessionId && mergedSessions[previousSelectedSessionId]) {
        // Selected session still exists, keep it
        newSelectedSessionId = previousSelectedSessionId;
      } else if (previousSelectedSessionId && previousSiblings.length > 0 && previousIndex >= 0) {
        // Selected session was deleted, try to select nearest sibling
        // First try next sibling (index + 1, + 2, ...)
        for (let i = previousIndex + 1; i < previousSiblings.length; i++) {
          if (mergedSessions[previousSiblings[i]]) {
            newSelectedSessionId = previousSiblings[i];
            break;
          }
        }
        // If no next sibling, try previous sibling (index - 1, - 2, ...)
        if (!newSelectedSessionId) {
          for (let i = previousIndex - 1; i >= 0; i--) {
            if (mergedSessions[previousSiblings[i]]) {
              newSelectedSessionId = previousSiblings[i];
              break;
            }
          }
        }
        // If no siblings remain, selection stays null
      }

      set({
        projects: updatedProjects,
        sessionTree,
        allSessions: mergedSessions,
        selectedSessionId: newSelectedSessionId,
        loadError: null,
      });

      return changes;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reload sessions';
      set({ loadError: message });
      return null;
    }
  },
}));
