/**
 * Murabba - Base Tool Class and Context
 * Defines the abstract interface and context contract for all interactive canvas tools.
 */

import type { GridModel } from '../core/GridModel';
import type { HistoryManager } from '../core/HistoryManager';
import type { RenderConfig, ToolType } from '../types/grid';

/**
 * Execution context supplied to tool pointer and lifecycle callbacks.
 */
export interface ToolContext {
  /** Reference to the primary cellular grid data model */
  model: GridModel;
  /** Undo/Redo history stack manager */
  history: HistoryManager;
  /** Active canvas rendering and display configuration */
  config: RenderConfig;
  /** Requests an asynchronous or next-frame canvas redraw */
  requestRender: () => void;
}

/**
 * Abstract base class for all editor tools (Draw, Erase, Fill, Brush, Pan, Select).
 */
export abstract class BaseTool {
  /** Tool identifier matching the active tool type */
  abstract readonly type: ToolType;

  /**
   * Invoked when a pointer or mouse button is pressed on the canvas.
   *
   * @param x Screen / viewport X pixel coordinate
   * @param y Screen / viewport Y pixel coordinate
   * @param ctx Tool execution context
   */
  abstract onPointerDown(x: number, y: number, ctx: ToolContext): void;

  /**
   * Invoked when a pointer or mouse moves across the canvas.
   *
   * @param x Screen / viewport X pixel coordinate
   * @param y Screen / viewport Y pixel coordinate
   * @param ctx Tool execution context
   */
  abstract onPointerMove(x: number, y: number, ctx: ToolContext): void;

  /**
   * Invoked when a pointer or mouse button is released.
   *
   * @param ctx Tool execution context
   */
  abstract onPointerUp(ctx: ToolContext): void;

  /**
   * Optional lifecycle hook invoked when the tool becomes the active tool.
   *
   * @param ctx Tool execution context
   */
  onActivate?(ctx: ToolContext): void;

  /**
   * Optional lifecycle hook invoked when switching away from this tool.
   *
   * @param ctx Tool execution context
   */
  onDeactivate?(ctx: ToolContext): void;

  /**
   * Returns the CSS cursor string to display while this tool is active.
   *
   * @returns CSS cursor keyword or URL
   */
  getCursor(): string {
    return 'crosshair';
  }
}
