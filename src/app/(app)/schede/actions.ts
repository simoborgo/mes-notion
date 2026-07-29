"use server";

import { revalidatePath } from "next/cache";
import { invalidateSchedeCache } from "@/lib/notion";

export async function revalidateSchede() {
  revalidatePath("/schede");
  invalidateSchedeCache();
}
