/**
 * CursorTool — Default neutral pointer tool.
 * No drawing or modification. Just allows panning with mouse drag
 * and inspecting the grid without making changes.
 */

import { BaseTool, ToolContext } from './BaseTool';
import type { ToolType } from '../types/grid';

export class CursorTool extends BaseTool {
  readonly type: ToolType = 'cursor' as ToolType;

  private isPanning = false;
  private lastX = 0;
  private lastY = 0;

  getCursor(): string {
    return this.isPanning ? 'grabbing' : 'default';
  }

  onPointerDown(x: number, y: number, _ctx: ToolContext): void {
    // Middle-click or left-click drag → pan
    this.isPanning = true;
    this.lastX = x;
    this.lastY = y;
  }

  onPointerMove(x: number, y: number, ctx: ToolContext): void {
    if (!this.isPanning) return;
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    ctx.config.panX += dx;
    ctx.config.panY += dy;
    this.lastX = x;
    this.lastY = y;
    ctx.requestRender();
  }

  onPointerUp(_ctx: ToolContext): void {
    this.isPanning = false;
  }
}
