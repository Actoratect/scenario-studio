import { ContextMenu } from '@scenario-studio/ui-kit';
import type { ContextMenuEntry } from '@scenario-studio/ui-kit';
import type { FieldAiContext, TextSuggestionPresetId } from '@scenario-studio/core';
import { AiCandidateOverlay } from '../global/AiCandidateOverlay';
import { AiService } from './AiService';
import { Toast } from './Toast';

// PR-AR: FieldAiContext を持って右クリックメニュー → AI 提案を起動する
// orchestrator。フィールド側 (textarea / input) は onContextMenu で
// `FieldAiActions.openTextMenu(event, context, onAccept)` を呼ぶだけ。
//
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §G7

export interface OpenTextMenuOptions {
  /** 採用された候補テキストでフィールドを更新するコールバック。 */
  onAccept: (text: string) => void;
  /** 「コピー」のみ可で「置換 / 追記」を出さない場合 (read-only 表示など)。 */
  copyOnly?: boolean;
}

export const FieldAiActions = {
  /** テキスト欄の右クリック時に呼ぶ。menu を表示し、選んだ preset で 3 案生成 → overlay。 */
  openTextMenu(event: MouseEvent, context: FieldAiContext, options: OpenTextMenuOptions): void {
    const status = AiService.status();
    const unlocked = status.kind === 'unlocked';
    const presets = AiService.textSuggestionPresets;
    const entries: ContextMenuEntry[] = presets.map((p) => ({
      id: p.id,
      icon: '🤖',
      label: p.label,
      hint: 'AI 3 案',
      enabled: unlocked,
      onSelect: () => {
        void runText(context, p.id, options);
      },
    }));
    if (!unlocked) {
      entries.push({ kind: 'separator' });
      entries.push({
        id: 'unlock-hint',
        icon: 'ℹ️',
        label: 'AI を unlock するには AI panel を開く',
        enabled: false,
        onSelect: () => {},
      });
    }
    ContextMenu.show(event, entries, 'AI テキスト提案');
  },
};

async function runText(
  context: FieldAiContext,
  presetId: TextSuggestionPresetId,
  options: OpenTextMenuOptions,
): Promise<void> {
  AiCandidateOverlay.startText({
    context,
    presetId,
    ...(options.copyOnly !== undefined ? { copyOnly: options.copyOnly } : {}),
    onAccept: options.onAccept,
  });
  try {
    const candidates = await AiService.requestTextSuggestions(context, presetId);
    AiCandidateOverlay.setTextResults(candidates);
  } catch (e) {
    AiCandidateOverlay.setError(e instanceof Error ? e.message : String(e));
    Toast.error(`AI 提案に失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
}
