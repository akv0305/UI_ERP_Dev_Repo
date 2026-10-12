'use client';

import {
  CreateUserRequest,
  UpdateUserRequest,
  type RoleOption,
  type ScopeOptionsResponse,
  type UserResponse,
} from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { z } from 'zod';
import { FormLayout, FormSection, SwitchField, TextField } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import {
  allRowsComplete,
  inactiveTargetOptions,
  toAssignmentInputs,
  toAssignmentRows,
  type AssignmentRow,
} from '@/lib/assignments';
import * as toast from '@/lib/toast';
import { AssignmentsEditor } from './assignments-editor';

// Form-level schemas: same rules as the API contracts, with on-screen messages from terminology.
const baseShape = {
  username: z.string().trim().min(1, terminology.validation.required).max(64),
  email: z.union([z.literal(''), z.email(terminology.validation.invalidEmail)]),
  displayName: z.string().trim().min(1, terminology.validation.required).max(120),
  isActive: z.boolean(),
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
  scopeOptions: ScopeOptionsResponse;
}

export function UserForm({ user, roleOptions, scopeOptions }: UserFormProps) {
  const router = useRouter();
  const keyCounter = useRef(0);
  const nextKey = () => {
    keyCounter.current += 1;

    return `new-${keyCounter.current}`;
  };
  const [assignmentRows, setAssignmentRows] = useState<AssignmentRow[]>(() =>
    toAssignmentRows(user?.assignments ?? []),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = user !== undefined;

  // Defaults are only read when the form mounts.
  const [defaults] = useState(() => ({
    username: user?.username ?? '',
    email: user?.email ?? '',
    displayName: user?.displayName ?? '',
    isActive: user?.isActive ?? true,
    temporaryPassword: '',
  }));

  async function handleSubmit(values: UserFormValues): Promise<void> {
    setErrorMessage(null);

    if (!allRowsComplete(assignmentRows)) {
      setErrorMessage(terminology.users.assignmentIncomplete);
      return;
    }

    const { temporaryPassword, ...account } = values;
    const assignments = toAssignmentInputs(assignmentRows);
    const payload = isEdit
      ? { ...account, assignments }
      : { ...account, temporaryPassword, assignments };
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
          <AssignmentsEditor
            rows={assignmentRows}
            onChange={setAssignmentRows}
            roles={roleOptions}
            scopeOptions={scopeOptions}
            inactiveTargets={inactiveTargetOptions(user?.assignments ?? [])}
            nextKey={nextKey}
          />
        </FormSection>
      </FormLayout>
    </div>
  );
}
