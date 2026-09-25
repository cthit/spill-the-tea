// Mostly copied from https://nextjs.org/docs/app/guides/authentication

import "server-only";
import { env, relativeUrl } from "@/lib/env";
import { AuthorizationCode, ClientApi, UserId } from "gammait";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ZodError } from "zod";
import { SessionPayload, SessionProfile } from "./types";

export function createGammaAuthorizationCode() {
  const redirectUri = env.GAMMA_REDIRECT_URI ?? relativeUrl("/callback");

  return new AuthorizationCode({
    clientId: env.GAMMA_CLIENT_ID,
    clientSecret: env.GAMMA_CLIENT_SECRET,
    redirectUri,
    scope: ["openid", "profile"],
  });
}

export function createGammaClientApi() {
  return new ClientApi({
    authorization: `pre-shared ${env.GAMMA_API_KEY_ID}:${env.GAMMA_API_KEY_SECRET}`,
  });
}

const secretKey = env.JWT_SECRET;
const encodedKey = new TextEncoder().encode(secretKey);

const SESSION_COOKIE = "session";
const STATE_COOKIE = "state";

/** Time before a session expires in milliseconds. */
const sessionExpireAfter = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/** Time before a state expires in milliseconds. */
const stateExpireAfter = 10 * 60 * 1000; // 10 minutes in milliseconds

/**
 * Encrypt a session as a JWT.
 * @param payload The JWT payload and expiration timestamp.
 * @returns The signed JWT string.
 */
export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(payload.exp)
    .sign(encodedKey);
}

/**
 * Verify and decrypt a JWT session.
 * @param session The JWT string.
 * @returns The decrypted session, or undefined if it is invalid.
 */
export async function decrypt(
  session: string | undefined = ""
): Promise<SessionPayload | undefined> {
  if (session == undefined) {
    return undefined;
  }
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ["HS256"],
    });
    return SessionPayload.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      console.log(`Failed to validate session. Invalid payload: ${error}`);
    } else {
      console.log("Failed to verify session");
    }
  }
}

/**
 * Create a new session for an authenticated user and store in a cookie.
 * @param profile The user profile.
 */
export async function createSession(profile: SessionProfile): Promise<void> {
  // Calculate the session expiration
  const expiresAt = new Date(Date.now() + sessionExpireAfter);
  const expiresAtSeconds = expiresAt.getTime() / 1000;

  // Create a new session
  const session = await encrypt({
    ...profile,
    exp: expiresAtSeconds,
  });

  // Store the session in a cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: env.NODE_ENV !== "development",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * Update the current session to extend the cookie expiration time.
 * Note that the token will still expire in the same time.
 */
export async function updateSession() {
  // Get the current session
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await decrypt(session);

  if (!session || !payload) {
    return null;
  }

  // Calculate the new expiration
  const expiresAt = new Date(Date.now() + sessionExpireAfter);

  // Create a new session with the new expiration time.
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: env.NODE_ENV !== "development",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * Delete the current session cookie, leaving the user unauthenticated.
 */
export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Verify that the session stored in the cookie is valid and redirect to
 * the login page if not.
 *
 * Protected server actions should call this function before processing
 * requests.
 *
 * @return The session if it exists and is valid.
 */
export const verifySession = cache(
  async (): Promise<SessionPayload | never> => {
    const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
    const session = await decrypt(cookie);

    // Check if session does not exist or has expired
    const currentTimeSeconds = Date.now() / 1000;
    if (session?.exp == undefined || session.exp <= currentTimeSeconds) {
      // The redirect is to the homepage instead of the login page since Gamma
      // will instantly authenticate the user if they have authorized the
      // client. This is an unintuitive user flow, as the user is logged in
      // without an intentional action.
      redirect("/");
    }

    return session;
  }
);

/**
 * Check if there is an authorized user who is an admin.
 * @return If the user is an admin.
 */
export async function isAdmin(): Promise<boolean> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await decrypt(cookie);

  // Check if session does not exist or has expired
  const currentTimeSeconds = Date.now() / 1000;
  if (session?.exp == undefined || session.exp <= currentTimeSeconds) {
    // Session has expired
    return false;
  }

  const clientApi = createGammaClientApi();
  try {
    const authorities = await clientApi.getAuthoritiesFor(
      session.gamma_id as UserId
    );
    return authorities.some(authority => authority.startsWith("admin"));
  } catch (error) {
    if (error instanceof Error) {
      console.warn(`Failed to fetch authorities from Gamma: ${error}`);
    } else {
      console.warn("Failed to fetch authorities from Gamma");
    }
    return false;
  }
}

/**
 * Get info about the user
 *
 * @return The session if it exists and is valid.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await decrypt(cookie);

  // Check if session does not exist or has expired
  const currentTimeSeconds = Date.now() / 1000;
  if (session?.exp == undefined || session.exp <= currentTimeSeconds) {
    return null;
  }

  return session;
});

export async function generateAndStoreRandomState(): Promise<string> {
  const randomState = crypto.getRandomValues(new Uint8Array(32));
  const encodedState = Buffer.from(randomState).toString("base64url");

  const expiresAt = new Date(Date.now() + stateExpireAfter);

  // Store the state in a cookie
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, encodedState, {
    httpOnly: true,
    secure: env.NODE_ENV !== "development",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });

  return encodedState;
}

export async function readState(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(STATE_COOKIE);
  return cookie?.value ?? null;
}

export async function deleteState(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(STATE_COOKIE);
}
