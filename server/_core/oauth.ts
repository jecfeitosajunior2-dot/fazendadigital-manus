import type { Request, Response } from "express";
import { db } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { createSession } from "./cookies";
import { env } from "./env";

export function getLoginUrl(origin: string, returnPath?: string): string {
  const state = Buffer.from(JSON.stringify({ origin, returnPath: returnPath || "/" })).toString("base64url");
  const redirectUri = `${origin}/api/oauth/callback`;
  return `${env.VITE_OAUTH_PORTAL_URL}/oauth/authorize?client_id=${env.VITE_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
}

export async function handleOAuthCallback(req: Request, res: Response) {
  const { code, state } = req.query as { code?: string; state?: string };
  
  if (!code) {
    return res.redirect("/?error=no_code");
  }

  let origin = req.headers.origin || `${req.protocol}://${req.headers.host}`;
  let returnPath = "/admin/overview";
  
  if (state) {
    try {
      const parsed = JSON.parse(Buffer.from(state, "base64url").toString());
      if (parsed.origin) origin = parsed.origin;
      if (parsed.returnPath) returnPath = parsed.returnPath;
    } catch {}
  }

  try {
    // Exchange code for token
    const redirectUri = `${origin}/api/oauth/callback`;
    const tokenRes = await fetch(`${env.OAUTH_SERVER_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.VITE_APP_ID,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("Token exchange failed:", await tokenRes.text());
      return res.redirect(`${origin}/?error=token_exchange`);
    }

    const tokenData = await tokenRes.json() as { access_token: string };
    
    // Get user info
    const userRes = await fetch(`${env.OAUTH_SERVER_URL}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      return res.redirect(`${origin}/?error=userinfo`);
    }

    const userInfo = await userRes.json() as { sub: string; name?: string; email?: string };
    
    // Upsert user in database
    const [existingUser] = await db.select().from(users).where(eq(users.openId, userInfo.sub)).limit(1);
    
    let userId: number;
    let userRole: "admin" | "user";
    
    if (existingUser) {
      userId = existingUser.id;
      userRole = (existingUser.role || "user") as "admin" | "user";
      await db.update(users).set({
        name: userInfo.name || existingUser.name,
        email: userInfo.email || existingUser.email,
        lastSignedIn: new Date(),
      }).where(eq(users.id, existingUser.id));
    } else {
      // Check if this is the owner
      const isOwner = userInfo.sub === env.OWNER_OPEN_ID;
      userRole = (isOwner ? "admin" : "user") as "admin" | "user";
      
      const result = await db.insert(users).values({
        openId: userInfo.sub,
        name: userInfo.name || "Usuário",
        email: userInfo.email || null,
        role: userRole,
        loginMethod: "oauth",
        lastSignedIn: new Date(),
      });
      userId = (result as any)[0]?.insertId ?? (result as any).insertId;
    }
    
    // Create session
    const token = await createSession({
      id: userId,
      openId: userInfo.sub,
      name: userInfo.name || "Usuário",
      email: userInfo.email || "",
      role: userRole,
    });
    
    res.cookie("session", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    
    return res.redirect(`${origin}${returnPath}`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return res.redirect(`${origin}/?error=oauth_error`);
  }
}
