import { terminology } from '@/config/terminology';

export function ActiveStatus({ isActive }: { isActive: boolean }) {
  return (
    <span className={isActive ? 'text-success' : 'text-muted-foreground'}>
      {isActive ? terminology.labels.active : terminology.labels.inactive}
    </span>
  );
}

export const ACTIVE_FILTER_OPTIONS = [
  { value: 'all', label: terminology.filters.all },
  { value: 'true', label: terminology.labels.active },
  { value: 'false', label: terminology.labels.inactive },
];
