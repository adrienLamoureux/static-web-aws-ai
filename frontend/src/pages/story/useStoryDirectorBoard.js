import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BOARD_STORAGE_KEY, buildDefaultBoard, normalizeBoard, readBoardState, toTimestamp } from "./storyDirectorUtils";
import { STORY_GROUP_TYPES } from "./constants";

function useStoryDirectorBoard(activeSessionId, scenes = []) {
  const [groupType, setGroupType] = useState(STORY_GROUP_TYPES[0].value);
  const [boardState, setBoardState] = useState(() => readBoardState());
  const sceneRefMap = useRef({});

  const sortedScenes = useMemo(
    () => [...scenes].sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt)),
    [scenes]
  );

  const currentBoard = useMemo(() => {
    if (!activeSessionId) return buildDefaultBoard(groupType);
    const sessionBoards = boardState[activeSessionId] || {};
    return normalizeBoard(sessionBoards[groupType], groupType);
  }, [activeSessionId, boardState, groupType]);

  const updateCurrentBoard = useCallback(
    (updater) => {
      if (!activeSessionId) return;
      setBoardState((prev) => {
        const sessionBoards = prev[activeSessionId] || {};
        const baseBoard = normalizeBoard(sessionBoards[groupType], groupType);
        const nextBoard = updater(baseBoard);
        if (!nextBoard) return prev;
        return {
          ...prev,
          [activeSessionId]: {
            ...sessionBoards,
            [groupType]: normalizeBoard(nextBoard, groupType),
          },
        };
      });
    },
    [activeSessionId, groupType]
  );

  useEffect(() => {
    if (!activeSessionId || sortedScenes.length === 0) return;
    updateCurrentBoard((board) => {
      const assignments = { ...board.assignments };
      const fallbackGroupId =
        board.activeGroupId === "all" ? board.groups[0]?.id : board.activeGroupId;
      let changed = false;

      sortedScenes.forEach((scene) => {
        if (!scene.sceneId || assignments[scene.sceneId] || !fallbackGroupId) return;
        assignments[scene.sceneId] = fallbackGroupId;
        changed = true;
      });

      if (!changed) return board;
      return { ...board, assignments };
    });
  }, [activeSessionId, sortedScenes, updateCurrentBoard]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(boardState));
  }, [boardState]);

  const groupCounts = useMemo(() => {
    const counts = {};
    sortedScenes.forEach((scene) => {
      const groupId = currentBoard.assignments[scene.sceneId];
      if (!groupId) return;
      counts[groupId] = (counts[groupId] || 0) + 1;
    });
    return counts;
  }, [currentBoard.assignments, sortedScenes]);

  const activeGroupId = currentBoard.activeGroupId;

  const visibleScenes = useMemo(() => {
    if (activeGroupId === "all") return sortedScenes;
    return sortedScenes.filter(
      (scene) => currentBoard.assignments[scene.sceneId] === activeGroupId
    );
  }, [activeGroupId, currentBoard.assignments, sortedScenes]);

  const handleSelectGroup = useCallback(
    (groupId) => {
      updateCurrentBoard((board) => ({ ...board, activeGroupId: groupId }));
    },
    [updateCurrentBoard]
  );

  const handleCreateGroup = useCallback(() => {
    updateCurrentBoard((board) => {
      const label =
        STORY_GROUP_TYPES.find((item) => item.value === groupType)?.label || "Group";
      const order = board.groups.length + 1;
      const groupId = `${groupType}-${Date.now().toString(36).slice(-5)}`;
      return {
        ...board,
        groups: [...board.groups, { id: groupId, name: `${label} ${order}` }],
        activeGroupId: groupId,
      };
    });
  }, [groupType, updateCurrentBoard]);

  const handleAssignSceneGroup = useCallback(
    (sceneId, groupId) => {
      updateCurrentBoard((board) => ({
        ...board,
        assignments: {
          ...board.assignments,
          [sceneId]: groupId,
        },
      }));
    },
    [updateCurrentBoard]
  );

  const setSceneRef = useCallback((sceneId, node) => {
    if (!sceneId || !node) return;
    sceneRefMap.current[sceneId] = node;
  }, []);

  const handleJumpToScene = useCallback(
    (sceneId, groupId) => {
      if (!sceneId) return;

      if (groupId && activeGroupId !== "all" && groupId !== activeGroupId) {
        handleSelectGroup(groupId);
        window.setTimeout(() => {
          sceneRefMap.current[sceneId]?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 80);
        return;
      }

      sceneRefMap.current[sceneId]?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [activeGroupId, handleSelectGroup]
  );

  return {
    groupType,
    setGroupType,
    currentBoard,
    sortedScenes,
    visibleScenes,
    activeGroupId,
    groupCounts,
    handleSelectGroup,
    handleCreateGroup,
    handleAssignSceneGroup,
    setSceneRef,
    handleJumpToScene,
  };
}

export default useStoryDirectorBoard;
