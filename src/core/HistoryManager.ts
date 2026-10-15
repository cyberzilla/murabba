/**
 * Murabba - Undo/Redo History Manager
 * Manages snapshots for state reversion and reapplication.
 */

import { HistorySnapshot } from '../types/grid';
import { GridModel } from './GridModel';

/**
 * HistoryManager maintains undo and redo stacks with configurable history capacity.
 */
export class HistoryManager {
  private _history: HistorySnapshot[] = [];
  private _redoStack: HistorySnapshot[] = [];
  private readonly _maxHistory: number;

  /**
   * Initializes the HistoryManager.
   *
   * @param maxHistory Maximum number of undo states to retain (default: 60)
   */
  constructor(maxHistory: number = 60) {
    this._maxHistory = Math.max(1, maxHistory);
  }

  /**
   * True if there are states available to undo.
   */
  public get canUndo(): boolean {
    return this._history.length > 0;
  }

  /**
   * True if there are states available to redo.
   */
  public get canRedo(): boolean {
    return this._redoStack.length > 0;
  }

  /**
   * Current number of undo states in the stack.
   */
  public get historyCount(): number {
    return this._history.length;
  }

  /**
   * Current number of redo states in the stack.
   */
  public get redoCount(): number {
    return this._redoStack.length;
  }

  /**
   * Maximum history capacity.
   */
  public get maxHistory(): number {
    return this._maxHistory;
  }

  /**
   * Saves the current grid state into the undo stack and clears the redo stack.
   * Call this BEFORE performing a mutating operation on the GridModel.
   *
   * @param model GridModel instance whose state will be snapshotted
   */
  public saveState(model: GridModel): void {
    this._history.push(model.snapshot());
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }
    this._redoStack = [];
  }

  /**
   * Undoes the last operation by reverting the model to its previous state.
   * Pushes the current state onto the redo stack.
   *
   * @param model GridModel instance to restore
   * @returns True if undo was successful, false if no states to undo
   */
  public undo(model: GridModel): boolean {
    if (this._history.length === 0) {
      return false;
    }

    const previousState = this._history.pop()!;
    this._redoStack.push(model.snapshot());
    model.applySnapshot(previousState);
    return true;
  }

  /**
   * Redoes the previously undone operation.
   * Pushes the current state onto the undo history stack.
   *
   * @param model GridModel instance to restore
   * @returns True if redo was successful, false if no states to redo
   */
  public redo(model: GridModel): boolean {
    if (this._redoStack.length === 0) {
      return false;
    }

    const nextState = this._redoStack.pop()!;
    this._history.push(model.snapshot());
    model.applySnapshot(nextState);
    return true;
  }

  /**
   * Clears both undo and redo stacks.
   */
  public clear(): void {
    this._history = [];
    this._redoStack = [];
  }
}
