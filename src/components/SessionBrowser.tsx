import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Search, ChevronRight, ChevronDown, FolderOpen, Calendar, ChevronsUpDown, X } from 'lucide-react';
import { useSessionStore, type DirectoryGroup, type YearGroup, type MonthGroup, type DayGroup, type SessionNode } from '../store/sessionStore';
import { groupSessionsByDirectory, groupSessionsByDate } from '../lib/sessionLoader';
import { useSidebarPreferences, type GroupingMode } from '../hooks/useSidebarPreferences';
import { useSessionSearch } from '../hooks/useSessionSearch';
import { LoadingSpinner } from './LoadingSpinner';
import { buildSessionTooltip } from '../utils/formatters';
import { DirectoryFilterDropdown, type DirectoryOption } from './DirectoryFilterDropdown';

interface SessionBrowserProps {
  sidebarOpen: boolean;
  onCloseSidebar?: () => void;
}

/**
 * Extracts directory name from path (last segment).
 */
function getDirectoryName(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] || path;
}

/**
 * Counts all sessions in a tree, including nested children.
 */
function countSessions(nodes: SessionNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countSessions(node.children), 0);
}

/**
 * Renders a single session item with optional nested children.
 */
function SessionItem({
  node,
  selectedSessionId,
  onSelect,
  depth = 1,
}: {
  node: SessionNode;
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
  depth?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedSessionId === node.session.id;
  const paddingLeft = 8 + depth * 16;
  const displayTitle = node.session.title || 'Untitled Session';
  const tooltip = buildSessionTooltip(node.session, { displayTitle });

  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <div>
      <div className="flex items-center">
        {/* Expand/collapse button for sessions with children */}
        {hasChildren ? (
          <button
            onClick={handleToggleExpand}
            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.session.title || 'session'}`}
            style={{ marginLeft: `${paddingLeft - 16}px` }}
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span style={{ marginLeft: `${paddingLeft}px` }} />
        )}
        <button
          onClick={() => onSelect(node.session.id)}
          aria-current={isSelected ? 'true' : undefined}
          className={`
            flex-1 text-left py-1.5 px-2 text-sm rounded-md transition-colors
            ${isSelected
              ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}
          `}
          title={tooltip}
        >
          <span className="block truncate">{node.session.title || 'Untitled Session'}</span>
        </button>
      </div>
      {/* Render children if expanded */}
      {hasChildren && isExpanded && (
        <div className="ml-2 border-l border-gray-200 dark:border-gray-700">
          {node.children.map((child) => (
            <SessionItem
              key={child.session.id}
              node={child}
              selectedSessionId={selectedSessionId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Renders a collapsible directory group with its sessions.
 */
function DirectoryGroupComponent({
  group,
  isExpanded,
  onToggle,
  selectedSessionId,
  onSelectSession,
}: {
  group: DirectoryGroup;
  isExpanded: boolean;
  onToggle: () => void;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}) {
  const directoryName = getDirectoryName(group.directory);

  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-1.5 px-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${directoryName}`}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
        )}
        <FolderOpen className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <span className="flex-1 truncate text-left" title={group.directory}>{directoryName}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full tabular-nums">
          {countSessions(group.sessions)}
        </span>
      </button>
      {isExpanded && group.sessions.length > 0 && (
        <div className="mt-1">
          {group.sessions.map((node) => (
            <SessionItem
              key={node.session.id}
              node={node}
              selectedSessionId={selectedSessionId}
              onSelect={onSelectSession}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Renders a collapsible day group with its sessions.
 */
function DayGroupComponent({
  group,
  isExpanded,
  onToggle,
  selectedSessionId,
  onSelectSession,
}: {
  group: DayGroup;
  isExpanded: boolean;
  onToggle: () => void;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}) {
  return (
    <div className="ml-4">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-1 px-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
        )}
        <span className="flex-1 text-left">{group.label}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
          {group.sessions.length}
        </span>
      </button>
      {isExpanded && (
        <div className="mt-1">
          {group.sessions.map((node) => (
            <SessionItem
              key={node.session.id}
              node={node}
              selectedSessionId={selectedSessionId}
              onSelect={onSelectSession}
              depth={3}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Renders a collapsible month group with its days.
 */
function MonthGroupComponent({
  group,
  isExpanded,
  onToggle,
  expandedDays,
  onToggleDay,
  selectedSessionId,
  onSelectSession,
}: {
  group: MonthGroup;
  isExpanded: boolean;
  onToggle: () => void;
  expandedDays: Set<string>;
  onToggleDay: (key: string) => void;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}) {
  const sessionCount = group.days.reduce((acc, day) => acc + day.sessions.length, 0);
  
  return (
    <div className="ml-2">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-1 px-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
        )}
        <span className="flex-1 text-left font-medium">{group.label}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {sessionCount}
        </span>
      </button>
      {isExpanded && (
        <div className="mt-1">
          {group.days.map((day) => {
            const dayKey = `${group.month}-${day.day}`;
            return (
              <DayGroupComponent
                key={dayKey}
                group={day}
                isExpanded={expandedDays.has(dayKey)}
                onToggle={() => onToggleDay(dayKey)}
                selectedSessionId={selectedSessionId}
                onSelectSession={onSelectSession}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Renders a collapsible year group with its months.
 */
function YearGroupComponent({
  group,
  isExpanded,
  onToggle,
  expandedMonths,
  onToggleMonth,
  expandedDays,
  onToggleDay,
  selectedSessionId,
  onSelectSession,
}: {
  group: YearGroup;
  isExpanded: boolean;
  onToggle: () => void;
  expandedMonths: Set<string>;
  onToggleMonth: (key: string) => void;
  expandedDays: Set<string>;
  onToggleDay: (key: string) => void;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}) {
  const sessionCount = group.months.reduce(
    (acc, month) => acc + month.days.reduce((dayAcc, day) => dayAcc + day.sessions.length, 0),
    0
  );

  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-1.5 px-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${group.label}`}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
        )}
        <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full tabular-nums">
          {sessionCount}
        </span>
      </button>
      {isExpanded && (
        <div className="mt-1">
          {group.months.map((month) => {
            const monthKey = `${group.year}-${month.month}`;
            return (
              <MonthGroupComponent
                key={monthKey}
                group={month}
                isExpanded={expandedMonths.has(monthKey)}
                onToggle={() => onToggleMonth(monthKey)}
                expandedDays={expandedDays}
                onToggleDay={onToggleDay}
                selectedSessionId={selectedSessionId}
                onSelectSession={onSelectSession}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Resize handle component for the sidebar.
 */
function ResizeHandle({
  onResize,
  onResizeEnd,
}: {
  onResize: (deltaX: number) => void;
  onResizeEnd: () => void;
}) {
  const isDragging = useRef(false);
  const startX = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const deltaX = e.clientX - startX.current;
      startX.current = e.clientX;
      onResize(deltaX);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        onResizeEnd();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onResize, onResizeEnd]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-10"
      title="Drag to resize"
    />
  );
}

/**
 * Grouping mode selector component.
 */
function GroupingModeSelector({
  mode,
  onChange,
}: {
  mode: GroupingMode;
  onChange: (mode: GroupingMode) => void;
}) {
  return (
    <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
      <button
        onClick={() => onChange('directory')}
        className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
          mode === 'directory'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
        aria-pressed={mode === 'directory'}
      >
        Directory
      </button>
      <button
        onClick={() => onChange('date')}
        className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
          mode === 'date'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
        aria-pressed={mode === 'date'}
      >
        Date
      </button>
    </div>
  );
}

/**
 * SessionBrowser - Left sidebar for browsing sessions organized by directory or date.
 * 
 * Features:
 * - Resizable width with drag handle
 * - Grouping mode selector (directory/date)
 * - Collapsible groups (directory or year->month->day tree)
 * - Sessions sorted by time (newest first)
 * - Session count badges
 * - Change folder button
 * - Preferences persisted to localStorage
 */
export function SessionBrowser({ sidebarOpen, onCloseSidebar }: SessionBrowserProps) {
  const { projects, selectedSessionId, selectSession, clearFolder, reloadFolder, isLoadingFolder, isReloading, allSessions, fileSystem } = useSessionStore();
  const { width, groupingMode, selectedDirectory, setWidth, setGroupingMode, setSelectedDirectory, minWidth, maxWidth } = useSidebarPreferences();
  const [currentWidth, setCurrentWidth] = useState(width);
  
  // Session search
  const { query, setQuery, results, clearSearch, isSearching } = useSessionSearch(allSessions, { includeMessages: true });
  
  // Set of matching session IDs for filtering
  const matchingSessionIds = useMemo(() => {
    if (!isSearching) return null;
    return new Set(results.map((r) => r.sessionId));
  }, [results, isSearching]);

  // Group sessions by directory
  const directoryGroups = useMemo(() => {
    return groupSessionsByDirectory(projects);
  }, [projects]);

  // Group sessions by date (year->month->day)
  const dateGroups = useMemo(() => {
    return groupSessionsByDate(projects);
  }, [projects]);

  // Build directory options for the filter dropdown
  const directoryOptions = useMemo((): DirectoryOption[] => {
    return directoryGroups.map((group) => ({
      path: group.directory,
      name: getDirectoryName(group.directory),
      sessionCount: countSessions(group.sessions),
    }));
  }, [directoryGroups]);

  // Clear selected directory if it no longer exists
  useEffect(() => {
    if (selectedDirectory && !directoryOptions.some((d) => d.path === selectedDirectory)) {
      setSelectedDirectory(null);
    }
  }, [directoryOptions, selectedDirectory, setSelectedDirectory]);

  // Helper to check if a session node is from the selected directory
  const isFromSelectedDirectory = useCallback((node: SessionNode): boolean => {
    if (!selectedDirectory) return true;
    return node.session.directory === selectedDirectory;
  }, [selectedDirectory]);

  // Helper to filter nodes by directory (keeps node if it or any descendant matches)
  const filterNodesByDirectory = useCallback((nodes: SessionNode[]): SessionNode[] => {
    if (!selectedDirectory) return nodes;
    
    return nodes
      .map((node) => {
        const matchingChildren = filterNodesByDirectory(node.children);
        if (isFromSelectedDirectory(node) || matchingChildren.length > 0) {
          return { ...node, children: matchingChildren };
        }
        return null;
      })
      .filter((node): node is SessionNode => node !== null);
  }, [selectedDirectory, isFromSelectedDirectory]);

  // Apply directory filter to directory groups
  const directoryFilteredGroups = useMemo(() => {
    if (!selectedDirectory) return directoryGroups;
    return directoryGroups
      .filter((group) => group.directory === selectedDirectory)
      .map((group) => ({
        ...group,
        sessions: filterNodesByDirectory(group.sessions),
      }));
  }, [directoryGroups, selectedDirectory, filterNodesByDirectory]);

  // Apply directory filter to date groups
  const directoryFilteredDateGroups = useMemo(() => {
    if (!selectedDirectory) return dateGroups;
    return dateGroups
      .map((yearGroup) => ({
        ...yearGroup,
        months: yearGroup.months
          .map((monthGroup) => ({
            ...monthGroup,
            days: monthGroup.days
              .map((dayGroup) => ({
                ...dayGroup,
                sessions: filterNodesByDirectory(dayGroup.sessions),
              }))
              .filter((dayGroup) => dayGroup.sessions.length > 0),
          }))
          .filter((monthGroup) => monthGroup.days.length > 0),
      }))
      .filter((yearGroup) => yearGroup.months.length > 0);
  }, [dateGroups, selectedDirectory, filterNodesByDirectory]);

  // Helper to filter a node tree, keeping nodes that match or have matching descendants
  const filterNodeTree = useCallback((node: SessionNode, ids: Set<string>): SessionNode | null => {
    const matchingChildren = node.children
      .map((child) => filterNodeTree(child, ids))
      .filter((child): child is SessionNode => child !== null);
    
    if (ids.has(node.session.id) || matchingChildren.length > 0) {
      return { ...node, children: matchingChildren };
    }
    return null;
  }, []);

  // Filtered groups when searching (applied AFTER directory filter)
  const filteredDirectoryGroups = useMemo(() => {
    if (!matchingSessionIds) return directoryFilteredGroups;
    return directoryFilteredGroups
      .map((group) => ({
        ...group,
        sessions: group.sessions
          .map((node) => filterNodeTree(node, matchingSessionIds))
          .filter((node): node is SessionNode => node !== null),
      }))
      .filter((group) => group.sessions.length > 0);
  }, [directoryFilteredGroups, matchingSessionIds, filterNodeTree]);

  const filteredDateGroups = useMemo(() => {
    if (!matchingSessionIds) return directoryFilteredDateGroups;
    return directoryFilteredDateGroups
      .map((yearGroup) => ({
        ...yearGroup,
        months: yearGroup.months
          .map((monthGroup) => ({
            ...monthGroup,
            days: monthGroup.days
              .map((dayGroup) => ({
                ...dayGroup,
                sessions: dayGroup.sessions
                  .map((node) => filterNodeTree(node, matchingSessionIds))
                  .filter((node): node is SessionNode => node !== null),
              }))
              .filter((dayGroup) => dayGroup.sessions.length > 0),
          }))
          .filter((monthGroup) => monthGroup.days.length > 0),
      }))
      .filter((yearGroup) => yearGroup.months.length > 0);
  }, [directoryFilteredDateGroups, matchingSessionIds, filterNodeTree]);

  // Pre-compute all month/day keys for auto-expanding during search
  const { allMonthKeys, allDayKeys } = useMemo(() => {
    const months = new Set<string>();
    const days = new Set<string>();
    for (const year of filteredDateGroups) {
      for (const month of year.months) {
        months.add(`${year.year}-${month.month}`);
        for (const day of month.days) {
          days.add(`${month.month}-${day.day}`);
        }
      }
    }
    return { allMonthKeys: months, allDayKeys: days };
  }, [filteredDateGroups]);

  // Expanded state for directory groups - collapsed by default
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set());

  // Expanded state for date groups (years, months, days) - all collapsed by default
  const [expandedYears, setExpandedYears] = useState<Set<number>>(() => new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());

  // Sync expanded directories when groups change - keep existing expanded state
  useEffect(() => {
    setExpandedDirectories((prev) => {
      const currentDirectories = new Set(directoryGroups.map((g) => g.directory));
      // Only keep directories that still exist
      const next = new Set<string>();
      for (const dir of prev) {
        if (currentDirectories.has(dir)) {
          next.add(dir);
        }
      }
      return next;
    });
  }, [directoryGroups]);

  // Check if any groups are expanded
  const hasExpandedGroups = useMemo(() => {
    if (groupingMode === 'directory') {
      return expandedDirectories.size > 0;
    }
    return expandedYears.size > 0 || expandedMonths.size > 0 || expandedDays.size > 0;
  }, [groupingMode, expandedDirectories, expandedYears, expandedMonths, expandedDays]);

  // Collapse all groups
  const handleCollapseAll = useCallback(() => {
    setExpandedDirectories(new Set());
    setExpandedYears(new Set());
    setExpandedMonths(new Set());
    setExpandedDays(new Set());
  }, []);

  // Expand all groups
  const handleExpandAll = useCallback(() => {
    if (groupingMode === 'directory') {
      setExpandedDirectories(new Set(directoryGroups.map((g) => g.directory)));
    } else {
      setExpandedYears(new Set(dateGroups.map((g) => g.year)));
      const allMonths = new Set<string>();
      const allDays = new Set<string>();
      for (const year of dateGroups) {
        for (const month of year.months) {
          allMonths.add(`${year.year}-${month.month}`);
          for (const day of month.days) {
            allDays.add(`${month.month}-${day.day}`);
          }
        }
      }
      setExpandedMonths(allMonths);
      setExpandedDays(allDays);
    }
  }, [groupingMode, directoryGroups, dateGroups]);

  const handleToggleDirectory = useCallback((directory: string) => {
    setExpandedDirectories((prev) => {
      const next = new Set(prev);
      if (next.has(directory)) {
        next.delete(directory);
      } else {
        next.add(directory);
      }
      return next;
    });
  }, []);

  const handleToggleYear = useCallback((year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  }, []);

  const handleToggleMonth = useCallback((key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleToggleDay = useCallback((key: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      selectSession(sessionId);
      const isMobile = window.matchMedia('(max-width: 767px)').matches;
      if (isMobile) {
        onCloseSidebar?.();
      }
    },
    [selectSession, onCloseSidebar]
  );

  const handleChangeFolder = useCallback(() => {
    clearFolder();
  }, [clearFolder]);

  const handleReloadFolder = useCallback(() => {
    if (!reloadFolder) return;
    void reloadFolder();
  }, [reloadFolder]);

  const handleResize = useCallback((deltaX: number) => {
    setCurrentWidth((prev) => Math.min(maxWidth, Math.max(minWidth, prev + deltaX)));
  }, [minWidth, maxWidth]);

  const handleResizeEnd = useCallback(() => {
    setWidth(currentWidth);
  }, [currentWidth, setWidth]);

  // Sync currentWidth with persisted width
  useEffect(() => {
    setCurrentWidth(width);
  }, [width]);

  return (
    <aside
      data-testid="session-browser"
      data-open={sidebarOpen}
      className={`
        fixed md:relative inset-y-0 left-0 z-30
        bg-white dark:bg-gray-800
        border-r border-gray-200 dark:border-gray-700
        transform transition-transform duration-200 ease-in-out
        flex flex-col h-full
        ${sidebarOpen
          ? 'translate-x-0'
          : '-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden md:border-r-0'}
      `}
      style={{ width: sidebarOpen ? `${currentWidth}px` : undefined }}
    >
      {/* Resize handle */}
      {sidebarOpen && (
        <ResizeHandle onResize={handleResize} onResizeEnd={handleResizeEnd} />
      )}

      {/* Search bar, directory filter, and grouping mode */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search sessions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm bg-gray-100 dark:bg-gray-700 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 rounded-lg outline-none transition-colors text-gray-800 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400"
            aria-label="Search sessions"
          />
          {isSearching && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <DirectoryFilterDropdown
          directories={directoryOptions}
          selected={selectedDirectory}
          onChange={setSelectedDirectory}
        />
        <GroupingModeSelector mode={groupingMode} onChange={setGroupingMode} />
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {groupingMode === 'directory' ? 'Directories' : 'Timeline'}
          </h3>
          <button
            onClick={hasExpandedGroups ? handleCollapseAll : handleExpandAll}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            aria-label={hasExpandedGroups ? 'Collapse all' : 'Expand all'}
            title={hasExpandedGroups ? 'Collapse all' : 'Expand all'}
          >
            <ChevronsUpDown className="w-4 h-4" />
          </button>
        </div>
        {isLoadingFolder ? (
          <div className="flex flex-col items-center justify-center py-8">
            <LoadingSpinner label="Loading sessions..." />
          </div>
        ) : groupingMode === 'directory' ? (
          filteredDirectoryGroups.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isSearching ? 'No matching sessions' : 'No sessions loaded'}
            </p>
          ) : (
            <div className="space-y-1">
              {filteredDirectoryGroups.map((group) => (
                <DirectoryGroupComponent
                  key={group.directory}
                  group={group}
                  isExpanded={isSearching || expandedDirectories.has(group.directory)}
                  onToggle={() => handleToggleDirectory(group.directory)}
                  selectedSessionId={selectedSessionId}
                  onSelectSession={handleSelectSession}
                />
              ))}
            </div>
          )
        ) : filteredDateGroups.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isSearching ? 'No matching sessions' : 'No sessions loaded'}
          </p>
        ) : (
          <div className="space-y-1">
            {filteredDateGroups.map((yearGroup) => (
              <YearGroupComponent
                key={yearGroup.year}
                group={yearGroup}
                isExpanded={isSearching || expandedYears.has(yearGroup.year)}
                onToggle={() => handleToggleYear(yearGroup.year)}
                expandedMonths={isSearching ? allMonthKeys : expandedMonths}
                onToggleMonth={handleToggleMonth}
                expandedDays={isSearching ? allDayKeys : expandedDays}
                onToggleDay={handleToggleDay}
                selectedSessionId={selectedSessionId}
                onSelectSession={handleSelectSession}
              />
            ))}
          </div>
        )}
      </div>

      {/* Change folder and reload buttons */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
        {fileSystem && (
          <button
            onClick={handleReloadFolder}
            disabled={isReloading}
            className="flex-1 py-2 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Reload
          </button>
        )}
        <button
          onClick={handleChangeFolder}
          className="flex-1 py-2 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
        >
          Change Folder
        </button>
      </div>
    </aside>
  );
}
