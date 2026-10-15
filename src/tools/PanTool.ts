/**
 * PanTool — Pan/scroll the canvas viewport.
 */
import { BaseTool, ToolContext } from './BaseTool';
import type { ToolType } from '../types/grid';

export class PanTool extends BaseTool {
  readonly type: ToolType = 'pan';
  private active = false;
  private startX = 0;
  private startY = 0;
  private startPanX = 0;
  private startPanY = 0;

  getCursor(): string {
    return this.active ? 'grabbing' : 'grab';
  }

  onPointerDown(x: number, y: number, ctx: ToolContext): void {
    this.active = true;
    this.startX = x;
    this.startY = y;
    this.startPanX = ctx.config.panX;
    this.startPanY = ctx.config.panY;
  }

  onPointerMove(x: number, y: number, ctx: ToolContext): void {
    if (!this.active) return;
    ctx.config.panX = this.startPanX + (x - this.startX);
    ctx.config.panY = this.startPanY + (y - this.startY);
    ctx.requestRender();
  }

  onPointerUp(_ctx: ToolContext): void {
    this.active = false;
  }

  onDeactivate(_ctx: ToolContext): void {
    this.active = false;
  }
}
