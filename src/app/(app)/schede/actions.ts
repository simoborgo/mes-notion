"use server";

import { revalidatePath, revalidateTag } from "next/cache";

export async function revalidateSchede() {
  revalidatePath("/schede");
  revalidateTag("schede", "default");
}
