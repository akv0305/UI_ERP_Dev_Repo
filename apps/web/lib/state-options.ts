import type { StateResponse } from '@uie/contracts';

export interface SelectOption {
  value: string;
  label: string;
}

/** Value used by selects for "no state"; mapped to null before sending. */
export const NO_STATE_VALUE = 'none';

export function stateLabel(state: Pick<StateResponse, 'gstCode' | 'name'>): string {
  return `${state.gstCode} ${state.name}`;
}

/** Active states, plus the one a record already uses even if it has since been deactivated. */
export function buildStateOptions(
  states: StateResponse[],
  currentStateId: string | null = null,
): SelectOption[] {
  return states
    .filter((state) => state.isActive || state.id === currentStateId)
    .map((state) => ({ value: state.id, label: stateLabel(state) }));
}
