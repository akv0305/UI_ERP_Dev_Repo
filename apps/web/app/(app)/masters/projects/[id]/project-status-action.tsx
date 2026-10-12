'use client';

import type { ProjectResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { terminology } from '@/config/terminology';
import { StatusToggle } from '../../_components/status-toggle';

export function ProjectStatusAction({ project }: { project: ProjectResponse }) {
  const router = useRouter();

  return (
    <StatusToggle
      isActive={project.isActive}
      path={`/api/projects/${project.id}`}
      labels={terminology.projects}
      onChanged={router.refresh}
    />
  );
}
