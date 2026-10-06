'use client';

import {
  CreateRoleRequest,
  ROLE_CODE_PATTERN,
  type Permission,
  type RoleResponse,
} from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { FormLayout, FormSection, SwitchField, TextField } from '@/components/erp';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import { buildPermissionGroups } from '@/lib/permission-groups';
import * as toast from '@/lib/toast';

const roleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, terminology.validation.required)
    .max(64)
    .regex(ROLE_CODE_PATTERN, terminology.validation.invalidRoleCode),
  name: z.string().trim().min(1, terminology.validation.required).max(120),
  isActive: z.boolean(),
});

type RoleValues = z.infer<typeof roleSchema>;

const PERMISSION_GROUPS = buildPermissionGroups();

export interface RoleFormProps {
  role?: RoleResponse;
  canManage: boolean;
}

function PermissionChecklist({
  value,
  disabled,
  onChange,
}: {
  value: Permission[];
  disabled: boolean;
  onChange: (next: Permission[]) => void;
}) {
  function toggle(code: Permission, checked: boolean): void {
    onChange(checked ? [...value, code] : value.filter((existing) => existing !== code));
  }

  function renderBox(code: Permission | null, actionLabel: string) {
    if (code === null) {
      return <span aria-hidden className="size-4" />;
    }

    const id = `permission-${code}`;

    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={value.includes(code)}
          disabled={disabled}
          onCheckedChange={(next) => toggle(code, next === true)}
        />
        <Label htmlFor={id} className="font-normal">
          {actionLabel}
        </Label>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {PERMISSION_GROUPS.map((group) => (
        <section
          key={group.labelKey}
          className="rounded-lg border border-border bg-surface p-[var(--card-padding)]"
        >
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {terminology.nav[group.labelKey]}
          </h3>
          <ul className="divide-y divide-border">
            {group.rows.map((row) => (
              <li
                key={row.labelKey}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-2 sm:grid-cols-[1fr_8rem_8rem]"
              >
                <span className="text-sm text-foreground">{terminology.nav[row.labelKey]}</span>
                {renderBox(row.view, terminology.permissionActions.view)}
                {renderBox(row.manage, terminology.permissionActions.manage)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function RoleForm({ role, canManage }: RoleFormProps) {
  const router = useRouter();
  const isEdit = role !== undefined;
  const isSystem = role?.isSystem === true;
  const readOnly = !canManage || isSystem;
  const [permissions, setPermissions] = useState<Permission[]>(role?.permissionCodes ?? []);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [defaults] = useState<RoleValues>(() => ({
    code: role?.code ?? '',
    name: role?.name ?? '',
    isActive: role?.isActive ?? true,
  }));

  async function handleSubmit(values: RoleValues): Promise<void> {
    setErrorMessage(null);

    const checked = CreateRoleRequest.safeParse({ ...values, permissionCodes: permissions });

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = isEdit
      ? await apiRequest('PATCH', `/api/roles/${role.id}`, checked.data)
      : await apiRequest('POST', '/api/roles', checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(isEdit ? terminology.roles.updated : terminology.roles.created);
    router.push('/administration/roles-and-permissions');
    router.refresh();
  }

  const permissionSection = (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {terminology.roles.sectionPermissions}
        </h2>
        <p className="text-xs text-muted-foreground">{terminology.roles.permissionsHint}</p>
      </div>
      <PermissionChecklist value={permissions} disabled={readOnly} onChange={setPermissions} />
    </section>
  );

  if (readOnly) {
    return (
      <div className="flex flex-col gap-4">
        {isSystem ? (
          <p className="text-sm text-muted-foreground">{terminology.roles.systemRoleNotice}</p>
        ) : null}
        {permissionSection}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <FormLayout<RoleValues>
        schema={roleSchema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/administration/roles-and-permissions')}
      >
        <FormSection title={terminology.roles.sectionDetails}>
          <TextField<RoleValues>
            name="code"
            label={terminology.roles.fieldCode}
            description={terminology.roles.fieldCodeHint}
            required
          />
          <TextField<RoleValues> name="name" label={terminology.roles.fieldName} required />
          <SwitchField<RoleValues> name="isActive" label={terminology.roles.fieldActive} />
        </FormSection>
        {permissionSection}
      </FormLayout>
    </div>
  );
}
