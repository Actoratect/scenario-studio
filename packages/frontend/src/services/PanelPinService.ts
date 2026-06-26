import { createSignal } from 'solid-js';
import type { NodeId } from '@scenario-studio/core';
import { SceneSelection, type SceneRef } from './SceneSelection';
import { SelectionContext } from './SelectionContext';

const [inspectorPins, setInspectorPins] = createSignal<ReadonlyMap<string, NodeId>>(new Map());
const [scriptPins, setScriptPins] = createSignal<ReadonlyMap<string, SceneRef>>(new Map());
const [currentScriptScenes, setCurrentScriptScenes] = createSignal<ReadonlyMap<string, SceneRef>>(
  new Map(),
);

export const PanelPinService = {
  inspectorPins,
  scriptPins,
  currentScriptScenes,

  inspectorNode(panelId: string): NodeId | undefined {
    return inspectorPins().get(panelId);
  },

  scriptScene(panelId: string): SceneRef | undefined {
    return scriptPins().get(panelId);
  },

  isInspectorPinned(panelId: string): boolean {
    return inspectorPins().has(panelId);
  },

  isScriptPinned(panelId: string): boolean {
    return scriptPins().has(panelId);
  },

  pinInspector(panelId: string, nodeId: NodeId): void {
    const next = new Map(inspectorPins());
    next.set(panelId, nodeId);
    setInspectorPins(next);
  },

  pinScript(panelId: string, scene: SceneRef): void {
    const next = new Map(scriptPins());
    next.set(panelId, scene);
    setScriptPins(next);
  },

  setCurrentScript(panelId: string, scene: SceneRef): void {
    const next = new Map(currentScriptScenes());
    next.set(panelId, scene);
    setCurrentScriptScenes(next);
  },

  clearCurrentScript(panelId: string): void {
    if (!currentScriptScenes().has(panelId)) return;
    const next = new Map(currentScriptScenes());
    next.delete(panelId);
    setCurrentScriptScenes(next);
  },

  toggleInspector(panelId: string): boolean {
    const next = new Map(inspectorPins());
    if (next.has(panelId)) {
      next.delete(panelId);
      setInspectorPins(next);
      return false;
    }
    const id = SelectionContext.selectedNodeId();
    if (!id) return false;
    PanelPinService.pinInspector(panelId, id);
    return true;
  },

  toggleScript(panelId: string): boolean {
    const next = new Map(scriptPins());
    if (next.has(panelId)) {
      next.delete(panelId);
      setScriptPins(next);
      return false;
    }
    const scene = currentScriptScenes().get(panelId) ?? SceneSelection.selected();
    if (!scene) return false;
    PanelPinService.pinScript(panelId, scene);
    return true;
  },

  clearPanel(panelId: string): void {
    if (inspectorPins().has(panelId)) {
      const next = new Map(inspectorPins());
      next.delete(panelId);
      setInspectorPins(next);
    }
    if (scriptPins().has(panelId)) {
      const next = new Map(scriptPins());
      next.delete(panelId);
      setScriptPins(next);
    }
    PanelPinService.clearCurrentScript(panelId);
  },
};
