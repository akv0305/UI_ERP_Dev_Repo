'use client';

import {
  CreateUserRequest,
  UpdateUserRequest,
  type RoleOption,
  type UserResponse,
} from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { FormLayout, FormSection, SwitchField, TextField } from '@/components/erp';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import * as toast from '@/lib/toast';

// Form-level schemas: same rules as the API contracts, with on-screen messages from terminology.
const baseShape = {
  username: z.string().trim().min(1, terminology.validation.required).max(64),
  email: z.union([z.literal(''), z.email(terminology.validation.invalidEmail)]),
  displayName: z.string().trim().min(1, terminology.validation.required).max(120),
  isActive: z.boolean(),
  roleIds: z.array(z.string()),
};

// Same value shape in both modes so one FormLayout type fits; edit mode ignores temporaryPassword.
const editSchema = z.object({ ...baseShape, temporaryPassword: z.string() });
const createSchema = z.object({
  ...baseShape,
  temporaryPassword: z
    .string()
    .min(8, terminology.validation.passwordTooShort)
    .regex(/[A-Za-z]/, terminology.validation.passwordNeedsLetter)
    .regex(/\d/, terminology.validation.passwordNeedsDigit),
});

type UserFormValues = z.infer<typeof createSchema>;

export interface UserFormProps {
  user?: UserResponse;
  roleOptions: RoleOption[];
}

function RolePicker({
  options,
  value,
  onChange,
}: {
  options: RoleOption[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <p className="text-sm font-medium text-foreground">{terminology.users.fieldRoles}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((role) => {
          const id = `role-${role.id}`;
          const checked = value.includes(role.id);

          return (
            <div key={role.id} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(next) =>
                  onChange(next === true ? [...value, role.id] : value.filter((v) => v !== role.id))
                }
              />
              <Label htmlFor={id} className="font-normal">
                {role.name}
                {role.isActive ? '' : ` (${terminology.labels.inactive})`}
              </Label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UserForm({ user, roleOptions }: UserFormProps) {
  const router = useRouter();
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    user?.roles.map((role) => role.id) ?? [],
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = user !== undefined;

  // Defaults are only read when the form mounts.
  const [defaults] = useState(() => ({
    username: user?.username ?? '',
    email: user?.email ?? '',
    displayName: user?.displayName ?? '',
    isActive: user?.isActive ?? true,
    roleIds: user?.roles.map((role) => role.id) ?? [],
    temporaryPassword: '',
  }));

  async function handleSubmit(values: UserFormValues): Promise<void> {
    setErrorMessage(null);

    const { temporaryPassword, ...account } = values;
    const payload = isEdit
      ? { ...account, roleIds: selectedRoles }
      : { ...account, temporaryPassword, roleIds: selectedRoles };
    // Validate once more against the real API contract before sending.
    const checked = isEdit
      ? UpdateUserRequest.safeParse(payload)
      : CreateUserRequest.safeParse(payload);

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = isEdit
      ? await apiRequest('PATCH', `/api/users/${user.id}`, checked.data)
      : await apiRequest('POST', '/api/users', checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(isEdit ? terminology.users.updated : terminology.users.created);
    router.push('/administration/users');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <FormLayout<UserFormValues>
        schema={isEdit ? editSchema : createSchema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/administration/users')}
      >
        <FormSection title={terminology.users.sectionAccount}>
          <TextField<UserFormValues>
            name="username"
            label={terminology.users.fieldUsername}
            required
          />
          <TextField<UserFormValues>
            name="displayName"
            label={terminology.users.fieldDisplayName}
            required
          />
          <TextField<UserFormValues>
            name="email"
            label={terminology.users.fieldEmail}
            type="email"
          />
          {isEdit ? null : (
            <TextField<UserFormValues>
              name="temporaryPassword"
              label={terminology.users.fieldTemporaryPassword}
              description={terminology.users.temporaryPasswordHint}
              type="password"
              autoComplete="new-password"
              required
            />
          )}
        </FormSection>
        <FormSection title={terminology.users.sectionAccess}>
          <SwitchField<UserFormValues> name="isActive" label={terminology.users.fieldActive} />
          <RolePicker options={roleOptions} value={selectedRoles} onChange={setSelectedRoles} />
        </FormSection>
      </FormLayout>
    </div>
  );
}
