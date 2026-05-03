import { render } from 'solid-js/web';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters, IContentRenderer } from 'dockview-core';

// Dockview の IContentRenderer を SolidJS コンポーネントでラップする最小アダプタ。
// Dockview は React/Vue 用バインディングしか公式提供がないため、Solid 用は自前で持つ。
// 詳細: ../../../../Documentation/ScenarioEditor/07_window-system.md, 12_architecture.md §3.1
export class SolidPanelView implements IContentRenderer {
  readonly element: HTMLElement;
  private disposeFn: (() => void) | undefined;

  constructor(private readonly component: Component<GroupPanelPartInitParameters>) {
    this.element = document.createElement('div');
    this.element.style.height = '100%';
    this.element.style.width = '100%';
  }

  init(parameters: GroupPanelPartInitParameters): void {
    this.disposeFn = render(() => this.component(parameters), this.element);
  }

  dispose(): void {
    this.disposeFn?.();
    this.disposeFn = undefined;
  }
}
