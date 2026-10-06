import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { terminology } from '@/config/terminology';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h1 className="mb-6 text-lg font-semibold text-foreground">{terminology.login.heading}</h1>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loginId">{terminology.login.loginId}</Label>
            <Input id="loginId" name="loginId" autoComplete="username" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{terminology.login.password}</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" />
          </div>

          <Button type="button" className="w-full">
            {terminology.actions.submit}
          </Button>
        </div>
      </div>
    </main>
  );
}
