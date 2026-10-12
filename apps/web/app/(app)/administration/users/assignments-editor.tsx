'use client';

import type { RoleOption, RoleScopeType, ScopeOptionsResponse } from '@uie/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { terminology } from '@/config/terminology';
import {
  allowedScopeTypes,
  changeRole,
  changeScopeType,
  newAssignmentRow,
  targetOptionsFor,
  type AssignmentRow,
} from '@/lib/assignments';
import type { SelectOption } from '@/lib/state-options';

export interface AssignmentsEditorProps {
  rows: AssignmentRow[];
  onChange: (rows: AssignmentRow[]) => void;
  roles: RoleOption[];
  scopeOptions: ScopeOptionsResponse;
  /** Inactive targets of assignments the user already has; they stay selectable on those rows. */
  inactiveTargets?: SelectOption[];
  /** Makes a unique row key (the form keeps the counter). */
  nextKey: () => string;
  disabled?: boolean;
}

const HEADER_CLASS =
  'h-[var(--row-height)] px-3 text-left text-xs font-medium uppercase text-muted-foreground';

function CellSelect({
  value,
  options,
  placeholder,
  label,
  onChange,
  disabled,
}: {
  value: string;
  options: SelectOption[];
  placeholder: string;
  label: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Role | Scope type | Target | remove. Which targets are offered depends on the scope type. */
export function AssignmentsEditor({
  rows,
  onChange,
  roles,
  scopeOptions,
  inactiveTargets = [],
  nextKey,
  disabled = false,
}: AssignmentsEditorProps) {
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const roleOptions = roles.map((role) => ({
    value: role.id,
    label: role.isActive ? role.name : `${role.name} (${terminology.labels.inactive})`,
  }));

  function update(key: string, change: (row: AssignmentRow) => AssignmentRow): void {
    onChange(rows.map((row) => (row.key === key ? change(row) : row)));
  }

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div>
        <p className="text-sm font-medium text-foreground">{terminology.users.fieldAssignments}</p>
        <p className="text-sm text-muted-foreground">{terminology.users.assignmentsHint}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{terminology.users.noAssignments}</p>
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-surface-muted">
              <tr className="border-b border-border">
                <th scope="col" className={HEADER_CLASS}>
                  {terminology.users.columnRole}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {terminology.users.columnScope}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {terminology.users.columnTarget}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  <span className="sr-only">{terminology.users.removeAssignment}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const role = roleById.get(row.roleId);
                const scopeChoices: SelectOption[] = allowedScopeTypes(role).map(
                  (scopeType: RoleScopeType) => ({
                    value: scopeType,
                    label: terminology.users.scopeTypes[scopeType],
                  }),
                );
                const targets = targetOptionsFor(row.scopeType, scopeOptions, inactiveTargets);

                return (
                  <tr key={row.key} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <CellSelect
                        value={row.roleId}
                        options={roleOptions}
                        placeholder={terminology.users.selectRole}
                        label={terminology.users.columnRole}
                        disabled={disabled}
                        onChange={(roleId) =>
                          update(row.key, (current) =>
                            changeRole(current, roleId, roleById.get(roleId)),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <CellSelect
                        value={row.scopeType}
                        options={scopeChoices}
                        placeholder={terminology.users.columnScope}
                        label={terminology.users.columnScope}
                        disabled={disabled}
                        onChange={(scopeType) =>
                          update(row.key, (current) =>
                            changeScopeType(current, scopeType as RoleScopeType),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      {row.scopeType === 'GLOBAL' ? null : (
                        <CellSelect
                          value={row.targetId}
                          options={targets}
                          placeholder={terminology.users.selectTarget}
                          label={terminology.users.columnTarget}
                          disabled={disabled}
                          onChange={(targetId) =>
                            update(row.key, (current) => ({ ...current, targetId }))
                          }
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        aria-label={terminology.users.removeAssignment}
                        onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...rows, newAssignmentRow(nextKey())])}
        >
          <Plus className="size-4" aria-hidden />
          {terminology.users.addAssignment}
        </Button>
      </div>
    </div>
  );
}
