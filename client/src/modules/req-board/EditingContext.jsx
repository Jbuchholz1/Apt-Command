import { createContext, useContext, useMemo, useState, useRef, useEffect } from 'react';

// Small shared state for "is anyone currently editing a cell on the board?".
// The auto-refresh interval reads this so it never clobbers whatever the user
// is typing. A counter (rather than a boolean) lets nested or overlapping
// edits compose safely — e.g. the user tabs from one cell into another
// without the intermediate blur flipping the interval back on.
const EditingContext = createContext({
  startEditing: () => {},
  stopEditing: () => {},
});

export { EditingContext };

export function useEditing() {
  return useContext(EditingContext);
}

/**
 * Owner-side hook: held by ReqBoardModule. Returns:
 *   - `isEditing`: boolean, true if any descendant is currently in edit mode
 *   - `editingRef`: a ref whose .current holds the latest count, safe to read
 *                   from inside setInterval closures
 *   - `editingApi`: stable `{ startEditing, stopEditing }` to feed into the
 *                   context provider
 */
export function useEditingState() {
  const [count, setCount] = useState(0);
  const ref = useRef(0);

  const editingApi = useMemo(() => ({
    startEditing: () => {
      ref.current += 1;
      setCount(ref.current);
    },
    stopEditing: () => {
      ref.current = Math.max(0, ref.current - 1);
      setCount(ref.current);
    },
  }), []);

  return { isEditing: count > 0, editingRef: ref, editingApi };
}

/**
 * Consumer-side hook: bind a component's local `editing` flag to the
 * board-wide editing counter. Increments on the rising edge, decrements
 * on the falling edge, and cleans up on unmount.
 */
export function useEditingSignal(editing) {
  const { startEditing, stopEditing } = useEditing();
  useEffect(() => {
    if (!editing) return undefined;
    startEditing();
    return () => stopEditing();
  }, [editing, startEditing, stopEditing]);
}
