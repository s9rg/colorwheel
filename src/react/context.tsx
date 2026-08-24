import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore
} from "react";
import type { ReactNode } from "react";
import type { JsonObject } from "../core";
import type { PickerController, PickerEquality, PickerSelector } from "../editor";

interface PickerContextValue {
  readonly controller: PickerController<JsonObject>;
}

const PickerContext = createContext<PickerContextValue | null>(null);

interface CommittedSelection<Result> {
  readonly hasValue: boolean;
  readonly value?: Result;
}

function createSelectorSnapshot<Result, Metadata extends object>(
  controller: PickerController<Metadata>,
  selector: PickerSelector<Result, Metadata>,
  equality: PickerEquality<Result>,
  committedSelection: { readonly current: CommittedSelection<Result> }
): () => Result {
  let hasMemoizedSelection = false;
  let memoizedSelection: Result;

  return () => {
    const nextSelection = controller.select(selector);

    if (!hasMemoizedSelection) {
      hasMemoizedSelection = true;
      const committed = committedSelection.current;
      if (committed.hasValue) {
        const previousSelection = committed.value as Result;
        if (equality(previousSelection, nextSelection)) {
          memoizedSelection = previousSelection;
          return previousSelection;
        }
      }
      memoizedSelection = nextSelection;
      return nextSelection;
    }

    if (equality(memoizedSelection, nextSelection)) return memoizedSelection;
    memoizedSelection = nextSelection;
    return nextSelection;
  };
}

export interface PickerProviderProps<Metadata extends object = JsonObject> {
  readonly controller: PickerController<Metadata>;
  readonly children?: ReactNode;
}

export function PickerProvider<Metadata extends object = JsonObject>({
  controller,
  children
}: PickerProviderProps<Metadata>) {
  return (
    <PickerContext.Provider
      value={{
        controller: controller as unknown as PickerController<JsonObject>
      }}
    >
      {children}
    </PickerContext.Provider>
  );
}

export function usePickerController<
  Metadata extends object = JsonObject
>(): PickerController<Metadata> {
  const value = useContext(PickerContext);
  if (value === null) {
    throw new Error("Colorwheel components must be rendered inside <Picker.Root>");
  }
  return value.controller as unknown as PickerController<Metadata>;
}

export function usePickerSelector<Result, Metadata extends object = JsonObject>(
  selector: PickerSelector<Result, Metadata>,
  equality: PickerEquality<Result> = Object.is
): Result {
  const controller = usePickerController<Metadata>();
  const committedSelection = useRef<CommittedSelection<Result>>({ hasValue: false });
  const subscribe = useCallback(
    (notify: () => void) => controller.subscribe(selector, () => notify(), equality),
    [controller, equality, selector]
  );
  const getSnapshot = useMemo(
    // Snapshot caching intentionally compares with the last committed value, following
    // useSyncExternalStoreWithSelector's concurrency-safe ref pattern.
    // eslint-disable-next-line react-hooks/refs
    () => createSelectorSnapshot(controller, selector, equality, committedSelection),
    [controller, equality, selector]
  );

  const selection = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    committedSelection.current = { hasValue: true, value: selection };
  }, [selection]);

  return selection;
}
