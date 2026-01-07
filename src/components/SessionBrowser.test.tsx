import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SessionBrowser } from './SessionBrowser';
import { useSessionStore, type ProjectInfo } from '../store/sessionStore';
import { createMinimalFileSystemMock } from '../test-utils/fileSystemMocks';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock the session store
vi.mock('../store/sessionStore', async () => {
  const actual = await vi.importActual<typeof import('../store/sessionStore')>(
    '../store/sessionStore'
  );
  return {
    ...actual,
    useSessionStore: vi.fn(),
  };
});

describe('SessionBrowser', () => {
  const mockSelectSession = vi.fn();
  const mockClearFolder = vi.fn();

  const createMockProjects = (): ProjectInfo[] => [
    {
      id: 'proj-1',
      path: '/Users/test/projects/opencode',
      sessions: [
        {
          session: {
            id: 'session-1',
            version: '1.0',
            projectID: 'proj-1',
            directory: '/Users/test/projects/opencode',
            title: 'Implement feature X',
            time: { created: 1704067200000, updated: 1704067200000 },
          },
          children: [
            {
              session: {
                id: 'session-1-child',
                version: '1.0',
                projectID: 'proj-1',
                directory: '/Users/test/projects/opencode',
                title: 'Explore implementation',
                parentID: 'session-1',
                time: { created: 1704067300000, updated: 1704067300000 },
              },
              children: [],
            },
          ],
        },
        {
          session: {
            id: 'session-2',
            version: '1.0',
            projectID: 'proj-1',
            directory: '/Users/test/projects/opencode',
            title: 'Fix bug Y',
            time: { created: 1704067100000, updated: 1704067100000 },
          },
          children: [],
        },
      ],
    },
    {
      id: 'proj-2',
      path: '/Users/test/projects/other-project',
      sessions: [
        {
          session: {
            id: 'session-3',
            version: '1.0',
            projectID: 'proj-2',
            directory: '/Users/test/projects/other-project',
            title: 'Refactor code',
            time: { created: 1704067000000, updated: 1704067000000 },
          },
          children: [],
        },
      ],
    },
  ];

  // Build allSessions record from projects
  const buildAllSessions = (projects: ProjectInfo[]): Record<string, ProjectInfo['sessions'][0]['session']> => {
    const result: Record<string, ProjectInfo['sessions'][0]['session']> = {};
    const collect = (nodes: ProjectInfo['sessions']) => {
      for (const node of nodes) {
        result[node.session.id] = node.session;
        collect(node.children);
      }
    };
    for (const project of projects) {
      collect(project.sessions);
    }
    return result;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    // Mock matchMedia for mobile detection
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false, // Default to desktop
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const mockProjects = createMockProjects();
    vi.mocked(useSessionStore).mockReturnValue({
      projects: mockProjects,
      allSessions: buildAllSessions(mockProjects),
      selectedSessionId: null,
      selectSession: mockSelectSession,
      clearFolder: mockClearFolder,
      reloadFolder: vi.fn(),
      isReloading: false,
    } as ReturnType<typeof useSessionStore>);
  });

  describe('rendering', () => {
    it('renders the search input', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      expect(screen.getByPlaceholderText('Search sessions...')).toBeInTheDocument();
      expect(screen.getByLabelText('Search sessions')).toBeInTheDocument();
    });

    it('renders project groups with names extracted from paths', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      expect(screen.getByText('opencode')).toBeInTheDocument();
      expect(screen.getByText('other-project')).toBeInTheDocument();
    });

    it('renders session count badges for each project', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // opencode has 3 sessions total (2 root + 1 nested child)
      expect(screen.getByText('3')).toBeInTheDocument();
      // other-project has 1 session
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('renders sessions when directory is expanded', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // Directories start collapsed by default - sessions should not be visible
      expect(screen.queryByText('Implement feature X')).not.toBeInTheDocument();

      // Click to expand the opencode directory
      const opencodeButton = screen.getByRole('button', { name: /Expand opencode/i });
      fireEvent.click(opencodeButton);

      // Root sessions should be visible
      expect(screen.getByText('Implement feature X')).toBeInTheDocument();
      expect(screen.getByText('Fix bug Y')).toBeInTheDocument();
      
      // Child session is nested under parent and requires expanding the parent
      expect(screen.queryByText('Explore implementation')).not.toBeInTheDocument();
      
      // Click the expand button for the parent session using accessible name
      const expandParentButton = screen.getByRole('button', { name: /Expand Implement feature X/i });
      fireEvent.click(expandParentButton);
      
      expect(screen.getByText('Explore implementation')).toBeInTheDocument();
    });

    it('renders Change Folder button', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      expect(screen.getByRole('button', { name: 'Change Folder' })).toBeInTheDocument();
    });

    it('shows "No projects loaded" when projects array is empty', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        projects: [],
        selectedSessionId: null,
        selectSession: mockSelectSession,
        clearFolder: mockClearFolder,
        reloadFolder: vi.fn(),
        isReloading: false,
      } as ReturnType<typeof useSessionStore>);

      render(<SessionBrowser sidebarOpen={true} />);

      expect(screen.getByText('No sessions loaded')).toBeInTheDocument();
    });

    it('renders the DIRECTORIES header', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      expect(screen.getByText('Directories')).toBeInTheDocument();
    });
  });

  describe('expand/collapse', () => {
    it('expands and collapses a directory when clicking on it', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // Directories start collapsed - sessions should not be visible
      expect(screen.queryByText('Implement feature X')).not.toBeInTheDocument();

      // Click to expand the opencode directory
      const opencodeButton = screen.getByRole('button', { name: /Expand opencode/i });
      fireEvent.click(opencodeButton);

      // Sessions from opencode should now be visible
      expect(screen.getByText('Implement feature X')).toBeInTheDocument();
      expect(screen.getByText('Fix bug Y')).toBeInTheDocument();

      // Click to collapse it again
      const collapseButton = screen.getByRole('button', { name: /Collapse opencode/i });
      fireEvent.click(collapseButton);

      // Sessions should be hidden again
      expect(screen.queryByText('Implement feature X')).not.toBeInTheDocument();
    });

    it('maintains expand state independently for each directory', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // Expand opencode
      const opencodeButton = screen.getByRole('button', { name: /Expand opencode/i });
      fireEvent.click(opencodeButton);

      // opencode sessions visible
      expect(screen.getByText('Implement feature X')).toBeInTheDocument();

      // other-project sessions still hidden
      expect(screen.queryByText('Refactor code')).not.toBeInTheDocument();

      // Expand other-project
      const otherButton = screen.getByRole('button', { name: /Expand other-project/i });
      fireEvent.click(otherButton);

      // Both directories' sessions now visible
      expect(screen.getByText('Implement feature X')).toBeInTheDocument();
      expect(screen.getByText('Refactor code')).toBeInTheDocument();
    });
  });

  describe('session selection', () => {
    it('calls selectSession when clicking a session', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // First expand the directory
      const opencodeButton = screen.getByRole('button', { name: /Expand opencode/i });
      fireEvent.click(opencodeButton);

      const sessionButton = screen.getByRole('button', { name: 'Implement feature X' });
      fireEvent.click(sessionButton);

      expect(mockSelectSession).toHaveBeenCalledWith('session-1');
    });

    it('calls selectSession for nested child sessions', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // First expand the directory
      const opencodeButton = screen.getByRole('button', { name: /Expand opencode/i });
      fireEvent.click(opencodeButton);

      // Click the expand button for the parent session using accessible name
      const expandParentButton = screen.getByRole('button', { name: /Expand Implement feature X/i });
      fireEvent.click(expandParentButton);

      const childSession = screen.getByRole('button', { name: 'Explore implementation' });
      fireEvent.click(childSession);

      expect(mockSelectSession).toHaveBeenCalledWith('session-1-child');
    });

    it('highlights the selected session with aria-current', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        projects: createMockProjects(),
        selectedSessionId: 'session-1',
        selectSession: mockSelectSession,
        clearFolder: mockClearFolder,
        reloadFolder: vi.fn(),
        isReloading: false,
      } as ReturnType<typeof useSessionStore>);

      render(<SessionBrowser sidebarOpen={true} />);

      // First expand the directory
      const opencodeButton = screen.getByRole('button', { name: /Expand opencode/i });
      fireEvent.click(opencodeButton);

      const selectedButton = screen.getByRole('button', { name: 'Implement feature X' });
      expect(selectedButton).toHaveAttribute('aria-current', 'true');

      // Non-selected session should not have aria-current
      const otherButton = screen.getByRole('button', { name: 'Fix bug Y' });
      expect(otherButton).not.toHaveAttribute('aria-current');
    });

    it('calls onCloseSidebar after selecting a session on mobile', () => {
      // Simulate mobile viewport
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: query === '(max-width: 767px)', // Mobile viewport
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      const mockCloseSidebar = vi.fn();
      render(<SessionBrowser sidebarOpen={true} onCloseSidebar={mockCloseSidebar} />);

      // First expand the directory
      const opencodeButton = screen.getByRole('button', { name: /Expand opencode/i });
      fireEvent.click(opencodeButton);

      const sessionButton = screen.getByRole('button', { name: 'Implement feature X' });
      fireEvent.click(sessionButton);

      expect(mockCloseSidebar).toHaveBeenCalled();
    });

    it('does not call onCloseSidebar after selecting a session on desktop', () => {
      // Default matchMedia mock returns false (desktop)
      const mockCloseSidebar = vi.fn();
      render(<SessionBrowser sidebarOpen={true} onCloseSidebar={mockCloseSidebar} />);

      // First expand the directory
      const opencodeButton = screen.getByRole('button', { name: /Expand opencode/i });
      fireEvent.click(opencodeButton);

      const sessionButton = screen.getByRole('button', { name: 'Implement feature X' });
      fireEvent.click(sessionButton);

      expect(mockCloseSidebar).not.toHaveBeenCalled();
    });
  });

  describe('change folder', () => {
    it('calls clearFolder when clicking Change Folder button', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      const changeFolderButton = screen.getByRole('button', { name: 'Change Folder' });
      fireEvent.click(changeFolderButton);

      expect(mockClearFolder).toHaveBeenCalled();
    });
  });

  describe('reload folder', () => {
    const mockReloadFolder = vi.fn();

    beforeEach(() => {
      mockReloadFolder.mockReset();
      mockReloadFolder.mockResolvedValue({ added: [], removed: [], updated: [] });
    });

    it('renders Reload button next to Change Folder', () => {
      const mockProjects = createMockProjects();
      vi.mocked(useSessionStore).mockReturnValue({
        projects: mockProjects,
        allSessions: buildAllSessions(mockProjects),
        selectedSessionId: null,
        selectSession: mockSelectSession,
        clearFolder: mockClearFolder,
        reloadFolder: mockReloadFolder,
        isReloading: false,
        fileSystem: createMinimalFileSystemMock(),
      } as unknown as ReturnType<typeof useSessionStore>);

      render(<SessionBrowser sidebarOpen={true} />);

      expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    });

    it('calls reloadFolder when clicking Reload button', () => {
      const mockProjects = createMockProjects();
      vi.mocked(useSessionStore).mockReturnValue({
        projects: mockProjects,
        allSessions: buildAllSessions(mockProjects),
        selectedSessionId: null,
        selectSession: mockSelectSession,
        clearFolder: mockClearFolder,
        reloadFolder: mockReloadFolder,
        isReloading: false,
        fileSystem: createMinimalFileSystemMock(),
      } as unknown as ReturnType<typeof useSessionStore>);

      render(<SessionBrowser sidebarOpen={true} />);

      const reloadButton = screen.getByRole('button', { name: 'Reload' });
      fireEvent.click(reloadButton);

      expect(mockReloadFolder).toHaveBeenCalled();
    });

    it('disables Reload button when isReloading is true', () => {
      const mockProjects = createMockProjects();
      vi.mocked(useSessionStore).mockReturnValue({
        projects: mockProjects,
        allSessions: buildAllSessions(mockProjects),
        selectedSessionId: null,
        selectSession: mockSelectSession,
        clearFolder: mockClearFolder,
        reloadFolder: mockReloadFolder,
        isReloading: true,
        fileSystem: createMinimalFileSystemMock(),
      } as unknown as ReturnType<typeof useSessionStore>);

      render(<SessionBrowser sidebarOpen={true} />);

      const reloadButton = screen.getByRole('button', { name: 'Reload' });
      expect(reloadButton).toBeDisabled();
    });

    it('hides Reload button when no folder is loaded', () => {
      const mockProjects = createMockProjects();
      vi.mocked(useSessionStore).mockReturnValue({
        projects: mockProjects,
        allSessions: buildAllSessions(mockProjects),
        selectedSessionId: null,
        selectSession: mockSelectSession,
        clearFolder: mockClearFolder,
        reloadFolder: mockReloadFolder,
        isReloading: false,
        fileSystem: null, // No folder loaded
      } as unknown as ReturnType<typeof useSessionStore>);

      render(<SessionBrowser sidebarOpen={true} />);

      expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();
    });
  });

  describe('sidebar visibility', () => {
    it('sets data-open to true when sidebarOpen is true', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      const aside = screen.getByTestId('session-browser');
      expect(aside).toHaveAttribute('data-open', 'true');
    });

    it('sets data-open to false when sidebarOpen is false', () => {
      render(<SessionBrowser sidebarOpen={false} />);

      const aside = screen.getByTestId('session-browser');
      expect(aside).toHaveAttribute('data-open', 'false');
    });
  });

  describe('search input', () => {
    it('renders an enabled search input', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      const searchInput = screen.getByPlaceholderText('Search sessions...');
      expect(searchInput).toBeEnabled();
    });

    it('filters sessions when searching by title', async () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // Expand directory first to see sessions
      const opencodeButton = screen.getByRole('button', { name: /Expand opencode/i });
      fireEvent.click(opencodeButton);

      // Both sessions visible initially
      expect(screen.getByText('Implement feature X')).toBeInTheDocument();
      expect(screen.getByText('Fix bug Y')).toBeInTheDocument();

      // Type in search
      const searchInput = screen.getByPlaceholderText('Search sessions...');
      fireEvent.change(searchInput, { target: { value: 'feature' } });

      // Wait for debounced search results
      await waitFor(() => {
        expect(screen.getByText('Implement feature X')).toBeInTheDocument();
      });

      // 'Fix bug Y' should be filtered out
      await waitFor(() => {
        expect(screen.queryByText('Fix bug Y')).not.toBeInTheDocument();
      });
    });

    it('shows clear button when searching', async () => {
      render(<SessionBrowser sidebarOpen={true} />);

      const searchInput = screen.getByPlaceholderText('Search sessions...');
      
      // No clear button initially
      expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();

      // Type in search
      fireEvent.change(searchInput, { target: { value: 'test' } });

      // Clear button appears
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
      });

      // Click clear
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

      // Input cleared
      expect(searchInput).toHaveValue('');
    });

    it('shows no matching sessions message when search has no results', async () => {
      render(<SessionBrowser sidebarOpen={true} />);

      const searchInput = screen.getByPlaceholderText('Search sessions...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent query xyz123' } });

      await waitFor(() => {
        expect(screen.getByText('No matching sessions')).toBeInTheDocument();
      });
    });

    it('auto-expands groups when searching', async () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // Initially groups are collapsed, session not visible
      expect(screen.queryByText('Implement feature X')).not.toBeInTheDocument();

      // Search for a session
      const searchInput = screen.getByPlaceholderText('Search sessions...');
      fireEvent.change(searchInput, { target: { value: 'feature' } });

      // Session becomes visible (group auto-expanded)
      await waitFor(() => {
        expect(screen.getByText('Implement feature X')).toBeInTheDocument();
      });
    });

    it('works with date grouping mode', async () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // Switch to date grouping
      const dateButton = screen.getByRole('button', { name: 'Date' });
      fireEvent.click(dateButton);

      // Search for a session
      const searchInput = screen.getByPlaceholderText('Search sessions...');
      fireEvent.change(searchInput, { target: { value: 'feature' } });

      // Session becomes visible in date view
      await waitFor(() => {
        expect(screen.getByText('Implement feature X')).toBeInTheDocument();
      });

      // Clear search and verify other sessions appear
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

      // With search cleared, we should see the timeline header
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });
  });

  describe('directory expansion sync', () => {
    it('keeps directories collapsed when new ones are added', () => {
      const { rerender } = render(<SessionBrowser sidebarOpen={true} />);

      // Initial state: directories collapsed, sessions not visible
      expect(screen.queryByText('Implement feature X')).not.toBeInTheDocument();

      // Expand opencode directory
      const opencodeButton = screen.getByRole('button', { name: /Expand opencode/i });
      fireEvent.click(opencodeButton);
      expect(screen.getByText('Implement feature X')).toBeInTheDocument();

      // Add a new project via store update
      const newProjects = [
        ...createMockProjects(),
        {
          id: 'proj-3',
          path: '/Users/test/projects/new-project',
          sessions: [
            {
              session: {
                id: 'session-new',
                version: '1.0',
                projectID: 'proj-3',
                directory: '/Users/test/projects/new-project',
                title: 'New session',
                time: { created: 1704067500000, updated: 1704067500000 },
              },
              children: [],
            },
          ],
        },
      ];

      vi.mocked(useSessionStore).mockReturnValue({
        projects: newProjects,
        selectedSessionId: null,
        selectSession: mockSelectSession,
        clearFolder: mockClearFolder,
        reloadFolder: vi.fn(),
        isReloading: false,
      } as ReturnType<typeof useSessionStore>);

      rerender(<SessionBrowser sidebarOpen={true} />);

      // New directory is collapsed, session not visible
      expect(screen.queryByText('New session')).not.toBeInTheDocument();
      // Previously expanded directory still shows its sessions
      expect(screen.getByText('Implement feature X')).toBeInTheDocument();
    });
  });

  describe('untitled sessions', () => {
    it('shows "Untitled Session" for sessions without titles', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        projects: [
          {
            id: 'proj-1',
            path: '/test',
            sessions: [
              {
                session: {
                  id: 'session-1',
                  version: '1.0',
                  projectID: 'proj-1',
                  directory: '/test',
                  title: '',
                  time: { created: 1704067200000, updated: 1704067200000 },
                },
                children: [],
              },
            ],
          },
        ],
        selectedSessionId: null,
        selectSession: mockSelectSession,
        clearFolder: mockClearFolder,
        reloadFolder: vi.fn(),
        isReloading: false,
      } as ReturnType<typeof useSessionStore>);

      render(<SessionBrowser sidebarOpen={true} />);

      // First expand the directory
      const testButton = screen.getByRole('button', { name: /Expand test/i });
      fireEvent.click(testButton);

      expect(screen.getByText('Untitled Session')).toBeInTheDocument();
    });
  });

  describe('session item tooltips', () => {
    it('shows rich tooltip with title, ID, and datetime', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // First expand the directory
      const opencodeButton = screen.getByRole('button', { name: /Expand opencode/i });
      fireEvent.click(opencodeButton);

      // Find the session button and check its title attribute
      const sessionButton = screen.getByRole('button', { name: 'Implement feature X' });
      const title = sessionButton.getAttribute('title');

      // Tooltip should contain the session title
      expect(title).toContain('Implement feature X');
      // Tooltip should contain the session ID
      expect(title).toContain('ID: session-1');
      // Tooltip should contain a formatted date (contains the date)
      expect(title).toMatch(/\d{4}/); // year
    });

    it('shows "Untitled Session" in tooltip for sessions without titles', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        projects: [
          {
            id: 'proj-1',
            path: '/test',
            sessions: [
              {
                session: {
                  id: 'session-untitled',
                  version: '1.0',
                  projectID: 'proj-1',
                  directory: '/test',
                  title: '',
                  time: { created: 1704067200000, updated: 1704067200000 },
                },
                children: [],
              },
            ],
          },
        ],
        selectedSessionId: null,
        selectSession: mockSelectSession,
        clearFolder: mockClearFolder,
        reloadFolder: vi.fn(),
        isReloading: false,
      } as ReturnType<typeof useSessionStore>);

      render(<SessionBrowser sidebarOpen={true} />);

      // First expand the directory
      const testButton = screen.getByRole('button', { name: /Expand test/i });
      fireEvent.click(testButton);

      const sessionButton = screen.getByRole('button', { name: 'Untitled Session' });
      const title = sessionButton.getAttribute('title');

      expect(title).toContain('Untitled Session');
      expect(title).toContain('ID: session-untitled');
    });
  });

  describe('directory filter dropdown', () => {
    it('renders the directory filter dropdown', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      expect(screen.getByRole('button', { name: 'Filter by directory' })).toBeInTheDocument();
    });

    it('shows "All directories" by default', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // The button text shows "All directories"
      expect(screen.getByText('All directories')).toBeInTheDocument();
    });

    it('shows total session count when "All directories" is selected', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // Total sessions: opencode has 3 (2 root + 1 child), other-project has 1 = 4
      expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('filters to show only sessions from selected directory', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // Initially both directories are shown (collapsed) - check expand buttons
      expect(screen.getByRole('button', { name: /Expand opencode/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Expand other-project/i })).toBeInTheDocument();

      // Open the filter dropdown
      fireEvent.click(screen.getByRole('button', { name: 'Filter by directory' }));

      // Select opencode
      fireEvent.click(screen.getByRole('option', { name: /opencode/ }));

      // Now only opencode should be visible in directory list
      expect(screen.getByRole('button', { name: /Expand opencode/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Expand other-project/i })).not.toBeInTheDocument();
    });

    it('applies directory filter before search in directory mode', async () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // Filter to opencode only
      fireEvent.click(screen.getByRole('button', { name: 'Filter by directory' }));
      fireEvent.click(screen.getByRole('option', { name: /opencode/ }));

      // Search for something that exists in other-project
      const searchInput = screen.getByPlaceholderText('Search sessions...');
      fireEvent.change(searchInput, { target: { value: 'Refactor' } });

      // Wait for search - should show no results because other-project is filtered out
      await waitFor(() => {
        expect(screen.getByText('No matching sessions')).toBeInTheDocument();
      });
    });

    it('applies directory filter before search in date mode', async () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // Switch to date grouping
      const dateButton = screen.getByRole('button', { name: 'Date' });
      fireEvent.click(dateButton);

      // Filter to other-project only
      fireEvent.click(screen.getByRole('button', { name: 'Filter by directory' }));
      fireEvent.click(screen.getByRole('option', { name: /other-project/ }));

      // Search for something in opencode
      const searchInput = screen.getByPlaceholderText('Search sessions...');
      fireEvent.change(searchInput, { target: { value: 'feature' } });

      // Should show no results because opencode is filtered out
      await waitFor(() => {
        expect(screen.getByText('No matching sessions')).toBeInTheDocument();
      });
    });

    it('can clear directory filter by selecting "All directories"', async () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // Filter to opencode
      fireEvent.click(screen.getByRole('button', { name: 'Filter by directory' }));
      fireEvent.click(screen.getByRole('option', { name: /opencode/ }));

      // Only opencode visible in the directory list (not other-project)
      // There's one in the filter dropdown and one in the directory list
      expect(screen.queryByRole('button', { name: /Expand other-project/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Expand opencode/i })).toBeInTheDocument();

      // Clear filter
      fireEvent.click(screen.getByRole('button', { name: 'Filter by directory' }));
      fireEvent.click(screen.getByRole('option', { name: /All directories/ }));

      // Both directories visible again in the directory list
      expect(screen.getByRole('button', { name: /Expand opencode/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Expand other-project/i })).toBeInTheDocument();
    });

    it('persists directory filter selection', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // Filter to opencode
      fireEvent.click(screen.getByRole('button', { name: 'Filter by directory' }));
      fireEvent.click(screen.getByRole('option', { name: /opencode/ }));

      // Check localStorage was updated
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'sidebar-preferences',
        expect.stringContaining('/Users/test/projects/opencode')
      );
    });

    it('shows sessions from selected directory when expanded', () => {
      render(<SessionBrowser sidebarOpen={true} />);

      // Filter to opencode
      fireEvent.click(screen.getByRole('button', { name: 'Filter by directory' }));
      fireEvent.click(screen.getByRole('option', { name: /opencode/ }));

      // Expand the directory
      const opencodeButton = screen.getByRole('button', { name: /Expand opencode/i });
      fireEvent.click(opencodeButton);

      // Sessions from opencode are visible
      expect(screen.getByText('Implement feature X')).toBeInTheDocument();
      expect(screen.getByText('Fix bug Y')).toBeInTheDocument();
    });
  });
});
