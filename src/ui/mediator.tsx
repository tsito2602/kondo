import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useReducer, useRef } from 'react';

export type UiEvent<TPayload = unknown> = Readonly<{
  type: string;
  payload?: TPayload;
  source?: string;
  path?: readonly string[];
}>;

export type UiDispatch = <TResult = unknown>(event: UiEvent) => TResult;
export type UiEffect = (event: UiEvent) => unknown;
export type UiEffects = Readonly<Record<string, UiEffect>>;
export type UiMiddleware = (event: UiEvent, next: UiDispatch) => unknown;

export type UiMediatorState = Readonly<{
  phase: 'idle' | 'handling' | 'error';
  active: number;
  revision: number;
  lastEvent: string | null;
  lastSource: string | null;
  error: string;
}>;

type MachineAction =
  | { type: 'begin'; event: UiEvent }
  | { type: 'resolve'; event: UiEvent }
  | { type: 'reject'; event: UiEvent; error: string };

type RoutedUiEvent = UiEvent & { effect?: UiEffect };
type UiChainValue = { path: readonly string[]; dispatch: UiDispatch };

const initialState: UiMediatorState = {
  phase: 'idle',
  active: 0,
  revision: 0,
  lastEvent: null,
  lastSource: null,
  error: '',
};

function reduceMachine(state: UiMediatorState, action: MachineAction): UiMediatorState {
  if (action.type === 'begin') {
    return {
      phase: 'handling',
      active: state.active + 1,
      revision: state.revision + 1,
      lastEvent: action.event.type,
      lastSource: action.event.source ?? null,
      error: '',
    };
  }
  if (action.type === 'resolve') {
    const active = Math.max(0, state.active - 1);
    return {
      ...state,
      phase: active ? 'handling' : 'idle',
      active,
      revision: state.revision + 1,
      lastEvent: action.event.type,
      lastSource: action.event.source ?? null,
      error: '',
    };
  }
  return {
    ...state,
    phase: 'error',
    active: Math.max(0, state.active - 1),
    revision: state.revision + 1,
    lastEvent: action.event.type,
    lastSource: action.event.source ?? null,
    error: action.error,
  };
}

function promiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(value && typeof (value as { then?: unknown }).then === 'function');
}

const UiChainContext = createContext<UiChainValue | null>(null);
const UiMediatorStateContext = createContext<UiMediatorState | null>(null);

export function UiMediatorProvider({ effects, children }: PropsWithChildren<{ effects: UiEffects }>) {
  const [state, machine] = useReducer(reduceMachine, initialState);
  const rootEffects = useRef(effects);
  rootEffects.current = effects;

  const dispatch = useCallback<UiDispatch>((event) => {
    machine({ type: 'begin', event });
    const routed = event as RoutedUiEvent;
    const effect = routed.effect ?? rootEffects.current[event.type];
    if (!effect) {
      const error = `Unhandled UI event: ${event.type}`;
      machine({ type: 'reject', event, error });
      throw new Error(error);
    }
    try {
      const result = effect(event);
      if (promiseLike(result)) {
        return result.then((value) => {
          machine({ type: 'resolve', event });
          return value;
        }).catch((cause: unknown) => {
          const error = cause instanceof Error ? cause.message : String(cause);
          machine({ type: 'reject', event, error });
          throw cause;
        }) as never;
      }
      machine({ type: 'resolve', event });
      return result as never;
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      machine({ type: 'reject', event, error });
      throw cause;
    }
  }, []);

  const chain = useMemo<UiChainValue>(() => ({ path: ['Root'], dispatch }), [dispatch]);
  return <UiMediatorStateContext.Provider value={state}><UiChainContext.Provider value={chain}>{children}</UiChainContext.Provider></UiMediatorStateContext.Provider>;
}

export function UiBoundary({ name, middleware, effects, children }: PropsWithChildren<{ name: string; middleware?: UiMiddleware; effects?: UiEffects }>) {
  const parent = useContext(UiChainContext);
  if (!parent) throw new Error('UiBoundary must be placed under UiMediatorProvider');
  const effectsRef = useRef(effects);
  const middlewareRef = useRef(middleware);
  effectsRef.current = effects;
  middlewareRef.current = middleware;
  const value = useMemo<UiChainValue>(() => {
    const path = [...parent.path, name];
    const dispatch: UiDispatch = (event) => {
      const selected = effectsRef.current?.[event.type];
      const decorated: RoutedUiEvent = {
        ...event,
        source: event.source ?? path.join('/'),
        path: event.path ?? path,
        ...(selected ? { effect: selected } : {}),
      };
      const currentMiddleware = middlewareRef.current;
      return (currentMiddleware ? currentMiddleware(decorated, parent.dispatch) : parent.dispatch(decorated)) as never;
    };
    return { path, dispatch };
  }, [name, parent]);
  return <UiChainContext.Provider value={value}>{children}</UiChainContext.Provider>;
}

export function useUiEmitter(source?: string): UiDispatch {
  const chain = useContext(UiChainContext);
  if (!chain) throw new Error('useUiEmitter must be used under UiMediatorProvider');
  return useCallback<UiDispatch>((event) => chain.dispatch({
    ...event,
    source: source ? `${chain.path.join('/')}/${source}` : event.source,
    path: event.path ?? chain.path,
  }) as never, [chain, source]);
}

export function useUiEmitterOptional(): UiDispatch | null {
  const chain = useContext(UiChainContext);
  return useMemo(() => {
    if (!chain) return null;
    const dispatch: UiDispatch = (event) => chain.dispatch({ ...event, path: event.path ?? chain.path }) as never;
    return dispatch;
  }, [chain]);
}

export function useUiMediatorState() {
  const state = useContext(UiMediatorStateContext);
  if (!state) throw new Error('useUiMediatorState must be used under UiMediatorProvider');
  return state;
}
