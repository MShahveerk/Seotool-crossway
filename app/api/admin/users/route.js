import { requireSuperAdmin } from "../../../../lib/middleware/auth";
import { getAllUsers, createUser, hashPassword, getUserByEmail, assignAccessibleSites } from "../../../../lib/auth";
import { ROLES } from "../../../../lib/rbac";
import { validateModulePermissionsInput } from "../../../../lib/modulePermissions";
import { logger } from "../../../../lib/logger";

// GET /api/admin/users - Get all users (Super Admin only)
export async function GET(req) {
  try {
    await requireSuperAdmin();
    
    const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "true";
    const users = await getAllUsers(includeInactive);
    
    return new Response(JSON.stringify({ users }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error.message === "Unauthorized" || error.message.includes("Super admin")) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Super admin access required" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    return new Response(
      JSON.stringify({ error: error.message || "Failed to fetch users" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// POST /api/admin/users - Create a new user (Super Admin only)
export async function POST(req) {
  try {
    const session = await requireSuperAdmin();
    
    const body = await req.json();
    const {
      email,
      password,
      name,
      role = "user",
      siteLink = null,
      gtmContainerId = null,
      facebookPageId = null,
      instagramUserId = null,
      isActive = true,
      accessibleSites = [],
      modulePermissions = null,
    } = body;
    
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    // Validate role
    const validRoles = [ROLES.USER, ROLES.VIEWER, ROLES.SMM, ROLES.APPROVER];
    if (role && !validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    const permCheck = validateModulePermissionsInput(modulePermissions, { role });
    if (!permCheck.valid) {
      return new Response(JSON.stringify({ error: permCheck.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "Email already registered" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    const hashedPassword = await hashPassword(password);
    const user = await createUser(
      email,
      hashedPassword,
      name || null,
      role,
      siteLink,
      session.user.id,
      {
        gtmContainerId,
        facebookPageId,
        instagramUserId,
        isActive: Boolean(isActive),
        skipVerification: true,
        modulePermissions: permCheck.value,
      }
    );

    if (accessibleSites && accessibleSites.length > 0 && (role === ROLES.VIEWER || role === ROLES.SMM || role === ROLES.APPROVER)) {
      await assignAccessibleSites(user.id, accessibleSites);
    }

    logger.info("User created by admin (active, no email verification)", {
      userId: user.id,
      email,
      createdBy: session.user.id,
    });

    return new Response(
      JSON.stringify({
        message: "User created successfully. They can sign in immediately with the password you set.",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          siteLink: user.siteLink,
          gtmContainerId: user.gtmContainerId || null,
          facebookPageId: user.facebookPageId || null,
          instagramUserId: user.instagramUserId || null,
          modulePermissions: user.modulePermissions ?? null,
          emailVerified: user.emailVerified,
          status: user.status,
        },
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    if (error.message === "Unauthorized" || error.message.includes("Super admin")) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Super admin access required" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    return new Response(
      JSON.stringify({ error: error.message || "Failed to create user" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

