import { ContextMenu } from '@scenario-studio/ui-kit';
import type { ContextMenuEntry } from '@scenario-studio/ui-kit';
import type { FieldAiContext } from '@scenario-studio/core';
import { AiCandidateOverlay } from '../global/AiCandidateOverlay';
import { AiService } from './AiService';

// PR-AR: FieldAiContext を持って右クリックメニュー → AI 提案を起動する
// orchestrator。フィールド側 (textarea / input) は onContextMenu で
// `FieldAiActions.openTextMenu(event, context, onAccept)` を呼ぶだけ。
// 送信は overlay の Show prompt 確認画面でユーザが承認してから行われる。
//
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §G7

export interface OpenTextMenuOptions {
  /** 採用された候補テキストでフィールドを更新するコールバック。 */
  onAccept: (text: string) => void;
  /** 「コピー」のみ可で「置換 / 追記」を出さない場合 (read-only 表示など)。 */
  copyOnly?: boolean;
}

export const FieldAiActions = {
  /**
   * テキスト欄の右クリック時に呼ぶ。menu を表示し、選んだ preset で
   * overlay の Show prompt 確認画面を開く (送信はユーザ承認後に overlay 側で実行)。
   */
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
        AiCandidateOverlay.startText({
          context,
          presetId: p.id,
          ...(options.copyOnly !== undefined ? { copyOnly: options.copyOnly } : {}),
          onAccept: options.onAccept,
        });
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
