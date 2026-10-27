import { createAuthClient } from "better-auth/react";
import { conBase } from "@/lib/base-path";

export const authClient = createAuthClient({ basePath: conBase("/api/auth") });
