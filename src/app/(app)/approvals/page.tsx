import { createClient } from "@/lib/supabase/server";
import type { PendingCoachApproval } from "@/lib/types/database";
import { ApprovalsClient } from "./approvals-client";

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const { data: pending } = await supabase.rpc("pending_coaches_for_approval");

  return <ApprovalsClient pending={(pending ?? []) as PendingCoachApproval[]} />;
}
