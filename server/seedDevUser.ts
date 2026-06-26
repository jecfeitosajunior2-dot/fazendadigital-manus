import bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { db } from "./db";
import { users } from "../drizzle/schema";
import { getDevAuthCredentials, shouldSeedDevUser } from "@shared/devAuth";

export async function seedDevUser() {
  if (!shouldSeedDevUser()) return;

  const creds = getDevAuthCredentials();
  const passwordHash = await bcrypt.hash(creds.password, 10);

  const [existing] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, creds.email), eq(users.openId, creds.openId)))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        name: creds.name,
        email: creds.email,
        passwordHash,
        role: creds.role,
        loginMethod: "local",
      })
      .where(eq(users.id, existing.id));
  } else {
    await db.insert(users).values({
      openId: creds.openId,
      name: creds.name,
      email: creds.email,
      passwordHash,
      role: creds.role,
      loginMethod: "local",
    });
  }

  console.log(`[dev] Login pronto: ${creds.email} / ${creds.password}`);
}
