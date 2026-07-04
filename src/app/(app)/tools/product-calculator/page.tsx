import { redirect } from "next/navigation";
import { getCurrentCoach } from "@/lib/auth";
import { ProductCalculatorClient } from "./product-calculator-client";

export default async function ProductCalculatorPage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  return <ProductCalculatorClient />;
}
