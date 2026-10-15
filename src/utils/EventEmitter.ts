/**
 * Murabba - Typed EventEmitter
 * Type-safe pub/sub event emitter for decoupled component architecture.
 */

/**
 * Event listener callback type.
 */
export type EventListener<T = unknown> = (data: T) => void;

/**
 * Base type for event map definition.
 */
export type EventMap = Record<string, unknown>;

/**
 * A type-safe Event Emitter supporting strongly-typed events and payloads.
 */
export class EventEmitter<Events extends EventMap = EventMap> {
  private readonly _listeners = new Map<keyof Events, Set<EventListener<any>>>();
  private readonly _onceWrappers = new Map<EventListener<any>, EventListener<any>>();

  /**
   * Subscribes a listener to an event.
   *
   * @param event The event name
   * @param listener The callback function
   * @returns An unsubscribe function to remove this listener
   */
  public on<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);

    return () => {
      this.off(event, listener);
    };
  }

  /**
   * Subscribes a one-time listener to an event.
   * Automatically unsubscribes after being called once.
   *
   * @param event The event name
   * @param listener The callback function
   * @returns An unsubscribe function to cancel the one-time subscription
   */
  public once<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): () => void {
    const wrapper: EventListener<Events[K]> = (data: Events[K]) => {
      this.off(event, wrapper);
      this._onceWrappers.delete(listener);
      listener(data);
    };

    this._onceWrappers.set(listener, wrapper);
    return this.on(event, wrapper);
  }

  /**
   * Unsubscribes a listener from an event.
   *
   * @param event The event name
   * @param listener The callback function to remove
   */
  public off<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): void {
    const set = this._listeners.get(event);
    if (!set) {
      return;
    }

    // Check if listener was wrapped by once()
    const wrapper = this._onceWrappers.get(listener);
    if (wrapper) {
      set.delete(wrapper);
      this._onceWrappers.delete(listener);
    }

    set.delete(listener);

    if (set.size === 0) {
      this._listeners.delete(event);
    }
  }

  /**
   * Emits an event with the associated payload to all subscribed listeners.
   *
   * @param event The event name
   * @param data The payload data conforming to Events[K]
   */
  public emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) {
      return;
    }

    // Clone to protect against listeners mutating the Set during iteration
    const listenersCopy = Array.from(set);
    for (let i = 0; i < listenersCopy.length; i++) {
      try {
        listenersCopy[i](data);
      } catch (err) {
        console.error(`Error in event listener for event "${String(event)}":`, err);
      }
    }
  }

  /**
   * Returns the count of listeners registered for a specific event.
   *
   * @param event The event name
   * @returns Number of active listeners
   */
  public listenerCount<K extends keyof Events>(event: K): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  /**
   * Removes all listeners for a given event, or all listeners for all events if no event is specified.
   *
   * @param event Optional event name to clear
   */
  public clear<K extends keyof Events>(event?: K): void {
    if (event !== undefined) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
      this._onceWrappers.clear();
    }
  }
}
