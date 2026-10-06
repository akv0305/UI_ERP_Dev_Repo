import { RoleOptionsResponse, UserResponse } from '@uie/contracts';
import { ErrorState, KeyValueGrid, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { formatDateTime } from '@/lib/format';
import { UserForm } from '../user-form';

function formatOptional(value: string | null, fallback: string): string {
  return value === null ? fallback : formatDateTime(value);
}

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('administration.users.view')) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const canManage = permissions.includes('administration.users.manage');
  const userResult = await apiGet(`/api/users/${encodeURIComponent(id)}`, UserResponse);

  if (userResult.kind === 'notFound') {
    return <ErrorState description={terminology.users.notFound} />;
  }

  if (userResult.kind !== 'ok') {
    return <ErrorState description={terminology.users.loadError} />;
  }

  const user = userResult.data;
  const locked = user.lockedUntil !== null && new Date(user.lockedUntil) > new Date();
  const info = (
    <KeyValueGrid
      items={[
        {
          label: terminology.users.infoLastLogin,
          value: formatOptional(user.lastLoginAt, terminology.users.never),
        },
        {
          label: terminology.users.infoLockedUntil,
          value:
            locked && user.lockedUntil !== null
              ? formatDateTime(user.lockedUntil)
              : terminology.users.notLocked,
        },
        { label: terminology.users.infoFailedLogins, value: String(user.failedLoginCount) },
        {
          label: terminology.users.infoMustChangePassword,
          value: user.mustChangePassword ? terminology.labels.yes : terminology.labels.no,
        },
        { label: terminology.users.infoCreated, value: formatDateTime(user.createdAt) },
        { label: terminology.users.infoUpdated, value: formatDateTime(user.updatedAt) },
      ]}
    />
  );

  if (!canManage) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={user.displayName} subtitle={user.username} />
        <KeyValueGrid
          items={[
            { label: terminology.users.fieldUsername, value: user.username },
            { label: terminology.users.fieldEmail, value: user.email ?? '' },
            {
              label: terminology.users.fieldActive,
              value: user.isActive ? terminology.labels.active : terminology.labels.inactive,
            },
            {
              label: terminology.users.fieldRoles,
              value:
                user.roles.length === 0
                  ? terminology.users.noRoles
                  : user.roles.map((role) => role.name).join(', '),
            },
          ]}
        />
        {info}
      </div>
    );
  }

  const roles = await apiGet('/api/users/role-options', RoleOptionsResponse);

  if (roles.kind !== 'ok') {
    return <ErrorState description={terminology.users.rolesUnavailable} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={terminology.users.editUser} subtitle={user.username} />
      <section className="rounded-lg border border-border bg-surface p-[var(--card-padding)]">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          {terminology.users.sectionInfo}
        </h2>
        {info}
      </section>
      <UserForm user={user} roleOptions={roles.data.items} />
    </div>
  );
}
