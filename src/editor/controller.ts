import { BUILT_IN_HARMONY_IDS, BUILT_IN_STRATEGY_VERSION, createHarmonyPalette } from "../core";
import type { BuiltInHarmonyRule, JsonObject, Palette, PaletteColor } from "../core";
import {
  DestroyedPickerControllerError,
  EditorStateError,
  LinkedInteractionError,
  MissingRegeneratorError
} from "./errors";
import { preparePickerAction, reducePreparedPickerState } from "./reducer";
import {
  areColorValuesEqual,
  assertChangeOptions,
  assertRuntimePalette,
  createPickerState,
  getColorById,
  normalizeChangeOptions,
  normalizePickerState,
  requireColorById,
  resolveRecipeSeedColorId
} from "./state";
import type {
  ChangeMeta,
  ChangeOptions,
  PickerAction,
  PickerCommands,
  PickerController,
  PickerControllerOptions,
  PickerEquality,
  PickerFocusTarget,
  PickerInteraction,
  PickerSelector,
  PickerState,
  PickerSubscription
} from "./types";

interface InternalSubscription<Metadata extends object> {
  readonly selector: PickerSelector<unknown, Metadata>;
  readonly listener: PickerSubscription<unknown>;
  readonly equality: PickerEquality<unknown>;
  current: unknown;
}

interface PendingTransaction<Metadata extends object> {
  readonly previousState: PickerState<Metadata>;
  readonly transactionId: string;
  readonly change: ChangeOptions;
  readonly metas: ChangeMeta[];
}

type Notification<Metadata extends object> = readonly [
  nextState: PickerState<Metadata>,
  previousPalette: Palette<Metadata>,
  meta: ChangeMeta,
  force: boolean,
  forcePalette: boolean
];

const actionDefaults: Record<PickerAction["type"], string> = {
  "replace-state": "programmatic",
  "replace-palette": "programmatic",
  "set-color": "programmatic",
  "add-color": "add",
  "remove-color": "remove",
  "reorder-color": "reorder",
  "set-color-locked": "lock",
  "set-color-name": "text-input",
  "set-color-role": "text-input",
  "set-active-color": "selection",
  "set-anchor-color": "selection",
  "set-wheel-options": "programmatic",
  regenerate: "regenerate"
};

function uniqueIds(groups: readonly (readonly string[])[]): readonly string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const id of group) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

function toChangeOptions(meta: Partial<ChangeMeta> | undefined): ChangeOptions {
  if (meta === undefined) return {};
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
    assertChangeOptions(meta);
    return {};
  }
  const change: ChangeOptions = {
    action: meta.action,
    origin: meta.origin,
    phase: meta.phase,
    transactionId: meta.transactionId
  };
  assertChangeOptions(change);
  return change;
}

function preparePickerControllerOptions<Metadata extends object>(
  value: unknown
): PickerControllerOptions<Metadata> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EditorStateError("Controller options must be an object");
  }
  const allowed = [
    "onChange",
    "onPaletteChange",
    "resolveLinkedColorUpdate",
    "regenerate",
    "createColorId",
    "createTransactionId",
    "onFocusRequest"
  ] as const;
  const snapshot: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key as (typeof allowed)[number])) {
      throw new EditorStateError(`Unsupported controller option ${String(key)}`);
    }
    const option = (value as Record<string, unknown>)[key];
    if (option !== undefined && typeof option !== "function") {
      throw new EditorStateError(`Controller option ${key} must be a function`);
    }
    if (option !== undefined) snapshot[key] = option;
  }
  return snapshot;
}

function mergeGeneratedPalette<Metadata extends object>(
  current: Palette<Metadata>,
  generated: Palette
): Palette<Metadata> {
  const generatedById = new Map(generated.colors.map((entry) => [entry.id, entry]));
  const currentIds = new Set(current.colors.map((entry) => entry.id));
  const currentSlotIds = new Set(
    current.recipe?.colorSlotIds ?? current.colors.map((entry) => entry.id)
  );
  const colors: PaletteColor<Metadata>[] = [];
  for (const existing of current.colors) {
    const generatedEntry = generatedById.get(existing.id);
    if (generatedEntry !== undefined) {
      colors.push({ ...existing, color: generatedEntry.color });
    } else if (!currentSlotIds.has(existing.id)) {
      // Colors outside the recipe slot map are manual/editor additions. They
      // are not owned by generation and must survive linked updates unchanged.
      colors.push(existing);
    }
  }
  for (const generatedEntry of generated.colors) {
    if (!currentIds.has(generatedEntry.id)) colors.push(generatedEntry as PaletteColor<Metadata>);
  }

  return {
    ...current,
    kind: generated.kind,
    colors,
    recipe: generated.recipe,
    provenance: generated.provenance
  };
}

function supportsDefaultWheelRecipe(recipe: Palette["recipe"]): recipe is NonNullable<
  Palette["recipe"]
> & {
  readonly type: "wheel";
  readonly harmony: BuiltInHarmonyRule;
} {
  if (recipe?.type !== "wheel" || recipe.harmony === undefined) return false;
  if (recipe.harmony.type === "custom") return false;
  const expectedId = BUILT_IN_HARMONY_IDS[recipe.harmony.type];
  const reference = recipe.strategy;
  return (
    reference === undefined ||
    (reference.id === expectedId && reference.version === BUILT_IN_STRATEGY_VERSION)
  );
}

function remapGeneratedPaletteIds<Metadata extends object>(
  state: PickerState<Metadata>,
  generated: Palette,
  seedColorId: string
): Palette {
  const generatedRecipe = generated.recipe;
  const generatedSeedColorId = generatedRecipe?.seedColorId;
  const generatedSlotIds = generatedRecipe?.colorSlotIds;
  const seedIndex = generatedSlotIds?.indexOf(generatedSeedColorId ?? "") ?? -1;
  const generatedById = new Map(generated.colors.map((entry) => [entry.id, entry]));
  const slotEntries = generatedSlotIds?.map((id) => generatedById.get(id));
  if (
    generatedRecipe === undefined ||
    generatedSeedColorId === undefined ||
    generatedSlotIds === undefined ||
    seedIndex < 0 ||
    slotEntries === undefined ||
    slotEntries.some((entry) => entry === undefined)
  ) {
    throw new LinkedInteractionError("Invalid recipe slots");
  }

  const currentSlotIds = state.palette.recipe?.colorSlotIds ?? state.colorFocusOrder;
  const companionIds = currentSlotIds.filter((id) => id !== seedColorId);
  const reservedIds = new Set(state.palette.colors.map((entry) => entry.id));
  const assignedIds = new Set<string>();
  let companionIndex = 0;
  let generatedId = 0;
  const nextGeneratedId = (): string => {
    let id: string;
    do id = `generated-color-${++generatedId}`;
    while (reservedIds.has(id) || assignedIds.has(id));
    return id;
  };

  const completeSlotEntries = slotEntries as readonly PaletteColor[];
  const colors = completeSlotEntries.map((entry, index) => {
    const id =
      index === seedIndex ? seedColorId : (companionIds[companionIndex++] ?? nextGeneratedId());
    assignedIds.add(id);
    return { ...entry, id };
  });
  return {
    ...generated,
    colors,
    recipe: {
      ...generatedRecipe,
      seedColorId,
      colorSlotIds: colors.map((entry) => entry.id)
    }
  };
}

function defaultLinkedColorUpdate<Metadata extends object>(
  state: PickerState<Metadata>,
  colorId: string,
  color: PaletteColor["color"]
): Palette<Metadata> {
  if (colorId !== state.anchorColorId) {
    throw new LinkedInteractionError(`Linked edits require anchor "${colorId}"`);
  }
  const recipe = state.palette.recipe;
  if (recipe?.type !== "wheel" || recipe.harmony === undefined) {
    throw new LinkedInteractionError(
      "Linked interaction requires a live wheel recipe with a harmony rule"
    );
  }
  if (!supportsDefaultWheelRecipe(recipe)) {
    throw new LinkedInteractionError("Unsupported recipe");
  }

  const generated = remapGeneratedPaletteIds(
    state,
    createHarmonyPalette({
      seed: color,
      harmony: recipe.harmony,
      outputGamut: state.wheel.outputGamut,
      name: state.palette.name
    }),
    colorId
  );
  return mergeGeneratedPalette(state.palette, generated);
}

function defaultRegenerate<Metadata extends object>(
  state: PickerState<Metadata>
): Palette<Metadata> {
  const recipe = state.palette.recipe;
  if (!supportsDefaultWheelRecipe(recipe)) throw new MissingRegeneratorError();
  const seedColorId = resolveRecipeSeedColorId(state.palette, state.wheel.outputGamut);
  const seed =
    recipe.seed ??
    (seedColorId === undefined ? undefined : getColorById(state.palette, seedColorId)?.color);
  if (seed === undefined || seedColorId === undefined) throw new MissingRegeneratorError();
  return defaultLinkedColorUpdate({ ...state, anchorColorId: seedColorId }, seedColorId, seed);
}

export function createPickerController<Metadata extends object = JsonObject>(
  initialState: PickerState<Metadata>,
  options: PickerControllerOptions<Metadata> = {}
): PickerController<Metadata> {
  const controllerOptions = preparePickerControllerOptions<Metadata>(options);
  let state = normalizePickerState(initialState);
  let destroyed = false;
  let colorIdCounter = 0;
  let transactionIdCounter = 0;
  let transactionDepth = 0;
  let pendingTransaction: PendingTransaction<Metadata> | undefined;
  const subscriptions = new Set<InternalSubscription<Metadata>>();
  const notifications: Notification<Metadata>[] = [];
  let emitting = false;

  function assertAlive(): void {
    if (destroyed) throw new DestroyedPickerControllerError();
  }

  function nextTransactionId(): string {
    const id =
      controllerOptions.createTransactionId?.() ?? `picker-transaction-${++transactionIdCounter}`;
    assertChangeOptions({ transactionId: id });
    return id;
  }

  function nextColorId(): string {
    if (controllerOptions.createColorId !== undefined) {
      const id = controllerOptions.createColorId(state);
      if (
        typeof id !== "string" ||
        id.length === 0 ||
        getColorById(state.palette, id) !== undefined
      ) {
        throw new Error(`Invalid or duplicate color ID "${id}"`);
      }
      return id;
    }
    let id: string;
    do {
      id = `color-${++colorIdCounter}`;
    } while (getColorById(state.palette, id) !== undefined);
    return id;
  }

  function emit(
    previousState: PickerState<Metadata>,
    meta: ChangeMeta,
    force = false,
    forcePalette = false
  ): void {
    notifications.push([state, previousState.palette, meta, force, forcePalette]);
    if (emitting) return;
    emitting = true;
    try {
      for (const [
        nextState,
        previousPalette,
        nextMeta,
        notifyAll,
        notifyPalette
      ] of notifications) {
        for (const subscription of [...subscriptions]) {
          const next = subscription.selector(nextState);
          if (notifyAll || !subscription.equality(subscription.current, next)) {
            subscription.current = next;
            subscription.listener(next, nextMeta);
          }
        }

        if (nextMeta.origin !== "external") {
          controllerOptions.onChange?.(nextState, nextMeta);
          if (notifyPalette || previousPalette !== nextState.palette) {
            controllerOptions.onPaletteChange?.(nextState.palette, nextMeta);
          }
        }
      }
    } finally {
      notifications.length = 0;
      emitting = false;
    }
  }

  function createMeta(
    action: PickerAction<Metadata>,
    changedColorIds: readonly string[]
  ): ChangeMeta {
    return {
      action: action.change?.action ?? actionDefaults[action.type],
      origin: action.change?.origin ?? "user",
      phase: action.change?.phase ?? "commit",
      changedColorIds,
      transactionId: action.change?.transactionId
    };
  }

  function resolveLinkedAction(action: PickerAction<Metadata>): PickerAction<Metadata> {
    if (
      action.type !== "set-color" ||
      state.wheel.interaction !== "linked" ||
      action.linkedPalette !== undefined
    ) {
      return action;
    }
    const current = requireColorById(state.palette, action.colorId);
    if (current.locked || areColorValuesEqual(current.color, action.color)) return action;
    const linkedPalette =
      controllerOptions.resolveLinkedColorUpdate?.({
        state,
        colorId: action.colorId,
        color: action.color
      }) ?? defaultLinkedColorUpdate(state, action.colorId, action.color);
    return { ...action, linkedPalette };
  }

  function applyAction(
    action: PickerAction<Metadata>,
    priorChangedColorIds: readonly string[] = []
  ): ChangeMeta | undefined {
    assertAlive();
    const preparedAction = preparePickerAction<Metadata>(action);
    const resolved = resolveLinkedAction(preparedAction);
    if (resolved !== preparedAction && resolved.type === "set-color") {
      assertRuntimePalette<Metadata>(resolved.linkedPalette);
    }
    const resolvedAction = resolved;
    const previousState = state;
    const reduction = reducePreparedPickerState(state, resolvedAction);
    if (reduction.state === state) return undefined;
    state = reduction.state;
    const meta = createMeta(
      resolvedAction,
      uniqueIds([priorChangedColorIds, reduction.changedColorIds])
    );
    if (transactionDepth > 0 && pendingTransaction !== undefined) {
      pendingTransaction.metas.push(meta);
    } else {
      emit(previousState, meta);
    }
    return meta;
  }

  function emitLifecycle(change: ChangeOptions, changedColorIds: readonly string[]): void {
    const meta: ChangeMeta = {
      action: change.action ?? "programmatic",
      origin: change.origin ?? "user",
      phase: change.phase ?? "commit",
      changedColorIds,
      transactionId: change.transactionId
    };
    if (transactionDepth > 0 && pendingTransaction !== undefined) {
      pendingTransaction.metas.push(meta);
    } else {
      emit(state, meta, true, meta.phase === "commit" && changedColorIds.length > 0);
    }
  }

  const commands: PickerCommands<Metadata> = {
    replacePalette(palette, change) {
      applyAction({ type: "replace-palette", palette, change });
    },
    setColor(colorId, color, change) {
      applyAction({ type: "set-color", colorId, color, change });
    },
    addColor(entry, index, change) {
      const id = entry.id ?? nextColorId();
      const complete: PaletteColor<Metadata> = { ...entry, id };
      applyAction({ type: "add-color", entry: complete, index, change });
      return id;
    },
    removeColor(colorId, change) {
      applyAction({ type: "remove-color", colorId, change });
    },
    reorderColor(colorId, toIndex, change) {
      applyAction({ type: "reorder-color", colorId, toIndex, change });
    },
    setLocked(colorId, locked, change) {
      applyAction({ type: "set-color-locked", colorId, locked, change });
    },
    setName(colorId, name, change) {
      applyAction({ type: "set-color-name", colorId, name, change });
    },
    setRole(colorId, role, change) {
      applyAction({ type: "set-color-role", colorId, role, change });
    },
    setActive(colorId, change) {
      applyAction({ type: "set-active-color", colorId, change });
    },
    setAnchor(colorId, change) {
      applyAction({ type: "set-anchor-color", colorId, change });
    },
    setWheelOptions(wheelOptions, change) {
      applyAction({ type: "set-wheel-options", options: wheelOptions, change });
    },
    regenerate(change) {
      const lockedColors = state.palette.colors.filter((entry) => entry.locked);
      const palette =
        controllerOptions.regenerate?.({ state, lockedColors }) ?? defaultRegenerate(state);
      applyAction({ type: "regenerate", palette, change });
    }
  };

  const controller: PickerController<Metadata> = {
    commands,
    getState() {
      return state;
    },
    setState(next, meta) {
      applyAction({
        type: "replace-state",
        state: next,
        change: { ...toChangeOptions(meta), origin: "external" }
      });
    },
    getPalette() {
      return state.palette;
    },
    setPalette(next, meta) {
      applyAction({
        type: "replace-palette",
        palette: next,
        change: { ...toChangeOptions(meta), origin: "external" }
      });
    },
    dispatch(action) {
      applyAction(action);
    },
    select(selector) {
      assertAlive();
      return selector(state);
    },
    subscribe(selector, listener, equality = Object.is) {
      assertAlive();
      const subscription: InternalSubscription<Metadata> = {
        selector,
        listener: listener as PickerSubscription<unknown>,
        equality: equality as PickerEquality<unknown>,
        current: selector(state)
      };
      subscriptions.add(subscription);
      return () => subscriptions.delete(subscription);
    },
    transaction(run, change = {}) {
      assertAlive();
      const normalizedChange = normalizeChangeOptions(change) ?? {};
      const outermost = transactionDepth === 0;
      if (outermost) {
        pendingTransaction = {
          previousState: state,
          transactionId: normalizedChange.transactionId ?? nextTransactionId(),
          change: normalizedChange,
          metas: []
        };
      }
      transactionDepth += 1;
      try {
        const result = run();
        transactionDepth -= 1;
        if (outermost) {
          const pending = pendingTransaction;
          pendingTransaction = undefined;
          if (pending !== undefined && pending.metas.length > 0) {
            const actions = new Set(pending.metas.map((meta) => meta.action));
            const origins = new Set(pending.metas.map((meta) => meta.origin));
            const meta: ChangeMeta = {
              action:
                pending.change.action ??
                (actions.size === 1
                  ? (pending.metas[0]?.action ?? "programmatic")
                  : "programmatic"),
              origin:
                pending.change.origin ??
                (origins.size === 1 ? (pending.metas[0]?.origin ?? "user") : "extension"),
              phase: pending.change.phase ?? "commit",
              changedColorIds: uniqueIds(pending.metas.map((item) => item.changedColorIds)),
              transactionId: pending.transactionId
            };
            emit(pending.previousState, meta);
          }
        }
        return result;
      } catch (error) {
        transactionDepth -= 1;
        if (outermost) {
          if (pendingTransaction !== undefined) state = pendingTransaction.previousState;
          pendingTransaction = undefined;
          transactionDepth = 0;
        }
        throw error;
      }
    },
    beginInteraction(change = {}) {
      assertAlive();
      const normalizedChange = normalizeChangeOptions(change) ?? {};
      const transactionId = normalizedChange.transactionId ?? nextTransactionId();
      const baseChange: ChangeOptions = {
        action: normalizedChange.action ?? "pointer",
        origin: normalizedChange.origin ?? "user",
        transactionId
      };
      let active = true;
      let started = false;
      const changed = new Set<string>();

      function ensureActive(): void {
        assertAlive();
        if (!active) throw new Error("Interaction ended");
      }

      function dispatchWithPhase(
        action: PickerAction<Metadata>,
        phase: "start" | "update" | "commit",
        priorChangedColorIds: readonly string[] = []
      ): ChangeMeta | undefined {
        const meta = applyAction(
          {
            ...action,
            change: { ...action.change, ...baseChange, phase }
          },
          priorChangedColorIds
        );
        for (const id of meta?.changedColorIds ?? []) changed.add(id);
        return meta;
      }

      const interaction: PickerInteraction<Metadata> = {
        transactionId,
        start(action) {
          ensureActive();
          if (started) return;
          if (action === undefined) {
            emitLifecycle({ ...baseChange, phase: "start" }, []);
          } else {
            const meta = dispatchWithPhase(action, "start");
            if (meta === undefined) emitLifecycle({ ...baseChange, phase: "start" }, []);
          }
          started = true;
        },
        update(action) {
          ensureActive();
          if (!started) interaction.start();
          dispatchWithPhase(action, "update");
        },
        commit(action) {
          ensureActive();
          if (!started) interaction.start();
          if (action === undefined) {
            emitLifecycle({ ...baseChange, phase: "commit" }, [...changed]);
          } else {
            const meta = dispatchWithPhase(action, "commit", [...changed]);
            if (meta === undefined) {
              emitLifecycle({ ...baseChange, phase: "commit" }, [...changed]);
            }
          }
          active = false;
        },
        cancel() {
          ensureActive();
          if (!started) interaction.start();
          emitLifecycle({ ...baseChange, phase: "commit" }, [...changed]);
          active = false;
        }
      };
      return interaction;
    },
    focus(target: PickerFocusTarget = { type: "root" }) {
      assertAlive();
      controllerOptions.onFocusRequest?.(target);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      subscriptions.clear();
    }
  };

  return controller;
}

export function createPickerControllerFromPalette<Metadata extends object = JsonObject>(
  palette: Palette<Metadata>,
  options?: PickerControllerOptions<Metadata>
): PickerController<Metadata> {
  return createPickerController(createPickerState({ palette }), options);
}
