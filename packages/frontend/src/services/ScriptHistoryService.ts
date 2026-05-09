import { createSignal } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type { ParsedScene } from '@scenario-studio/core';

const HISTORY_LIMIT = 100;

interface HistoryStacks {
  undo: ParsedScene[];
  redo: ParsedScene[];
}

interface ScriptHistoryController {
  undo: () => void;
  redo: () => void;
}

const sceneHistory = new Map<string, HistoryStacks>();
const [activePath, setActivePathSignal] = createSignal<string | undefined>(undefined);
const [revision, setRevision] = createSignal(0);
let activeController: ScriptHistoryController | undefined;

function touch(): void {
  setRevision((v) => v + 1);
}

function getHistory(path: string): HistoryStacks {
  let h = sceneHistory.get(path);
  if (!h) {
    h = { undo: [], redo: [] };
    sceneHistory.set(path, h);
  }
  return h;
}

function cloneScene(s: ParsedScene): ParsedScene {
  const raw = unwrap(s) as ParsedScene;
  return JSON.parse(JSON.stringify(raw)) as ParsedScene;
}

export const ScriptHistoryService = {
  activePath,
  revision,

  setActivePath(path: string | undefined): void {
    setActivePathSignal(path);
    touch();
  },

  registerController(controller: ScriptHistoryController): () => void {
    ScriptHistoryService.activateController(controller);
    return () => {
      if (activeController === controller) {
        activeController = undefined;
        touch();
      }
    };
  },

  activateController(controller: ScriptHistoryController): void {
    activeController = controller;
    touch();
  },

  cloneScene,

  canUndo(path = activePath()): boolean {
    revision();
    return path ? (sceneHistory.get(path)?.undo.length ?? 0) > 0 : false;
  },

  canRedo(path = activePath()): boolean {
    revision();
    return path ? (sceneHistory.get(path)?.redo.length ?? 0) > 0 : false;
  },

  canApply(): boolean {
    revision();
    return activeController !== undefined;
  },

  push(path: string, scene: ParsedScene): void {
    const h = getHistory(path);
    h.undo.push(cloneScene(scene));
    if (h.undo.length > HISTORY_LIMIT) h.undo.shift();
    h.redo.length = 0;
    setActivePathSignal(path);
    touch();
  },

  takeUndo(path: string, current: ParsedScene): ParsedScene | undefined {
    const h = getHistory(path);
    const prev = h.undo.pop();
    if (!prev) return undefined;
    h.redo.push(cloneScene(current));
    if (h.redo.length > HISTORY_LIMIT) h.redo.shift();
    setActivePathSignal(path);
    touch();
    return cloneScene(prev);
  },

  takeRedo(path: string, current: ParsedScene): ParsedScene | undefined {
    const h = getHistory(path);
    const next = h.redo.pop();
    if (!next) return undefined;
    h.undo.push(cloneScene(current));
    if (h.undo.length > HISTORY_LIMIT) h.undo.shift();
    setActivePathSignal(path);
    touch();
    return cloneScene(next);
  },

  undo(): boolean {
    if (!activeController || !ScriptHistoryService.canUndo()) return false;
    activeController.undo();
    return true;
  },

  redo(): boolean {
    if (!activeController || !ScriptHistoryService.canRedo()) return false;
    activeController.redo();
    return true;
  },
};
