/**
 * CursorTool — Default neutral "safe mode" pointer tool.
 * Does nothing on click or drag. Simply returns the canvas
 * to a neutral state where no accidental drawing/erasing occurs.
 */

import { BaseTool, ToolContext } from './BaseTool';
import type { ToolType } from '../types/grid';

export class CursorTool extends BaseTool {
  readonly type: ToolType = 'cursor' as ToolType;

  getCursor(): string {
    return 'default';
  }

  onPointerDown(_x: number, _y: number, _ctx: ToolContext): void { /* no-op */ }
  onPointerMove(_x: number, _y: number, _ctx: ToolContext): void { /* no-op */ }
  onPointerUp(_ctx: ToolContext): void { /* no-op */ }
}
