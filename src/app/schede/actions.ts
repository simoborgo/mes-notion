"use server";

import { revalidatePath } from "next/cache";

export async function revalidateSchede() {
  revalidatePath("/schede");
}
