import { redirect } from "next/navigation";
import { getCurrentCoach, getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/(app)/actions";
import { recheckApproval, retryRegistration } from "./actions";

export default async function PendingApprovalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");
  if (coach.approved && coach.active) redirect("/dashboard");

  const rejected = !coach.active;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <h1 className="text-2xl font-semibold">
        {rejected ? "Registration not approved" : "Waiting for approval"}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {rejected
          ? `Your registration wasn't approved. Please check with your sponsor — if your details were wrong, correct them and try again below.`
          : `Hi ${coach.name}, your registration is still waiting on an admin in your sponsor line to approve it. You'll be able to use the app as soon as that happens — no need to register again.`}
      </p>
      <div className="mt-6 flex w-full flex-col gap-2">
        {rejected ? (
          <form action={retryRegistration}>
            <Button type="submit" className="w-full">
              Try again
            </Button>
          </form>
        ) : (
          <form action={recheckApproval}>
            <Button type="submit" variant="outline" className="w-full">
              Check again
            </Button>
          </form>
        )}
        <form action={signOut}>
          <Button type="submit" variant="ghost" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
