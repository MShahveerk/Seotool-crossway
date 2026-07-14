import { requireSuperAdmin } from "../../../../../lib/middleware/auth";
import {
  getUserById,
  updateUser,
  deleteUser,
  assignSiteLink,
  assignAccessibleSites,
  hashPassword,
} from "../../../../../lib/auth";
import { ROLES } from "../../../../../lib/rbac";
import { validatePassword } from "../../../../../lib/validation";
import prisma from "../../../../../lib/prisma";

// GET /api/admin/users/[id] - Get user by ID (Super Admin only)
export async function GET(req, { params }) {
  try {
    await requireSuperAdmin();
    
    const { id } = await params;
    const user = await getUserById(id);
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    return new Response(
      JSON.stringify({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role || "user",
          siteLink: user.siteLink || null,
          gtmContainerId: user.gtmContainerId || null,
          facebookPageId: user.facebookPageId || null,
          instagramUserId: user.instagramUserId || null,
          accessibleSites: user.accessibleSites || [],
          isActive: user.isActive !== false,
          emailVerified: user.emailVerified || false,
          status: user.status || (user.emailVerified ? "active" : "pending"),
          emailVerifiedAt: user.emailVerifiedAt || null,
          createdAt: user.createdAt,
          createdBy: user.createdBy || null,
        },
      }),
      {
        status: 200,
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
      JSON.stringify({ error: error.message || "Failed to fetch user" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// PATCH /api/admin/users/[id] - Update user (Super Admin only)
export async function PATCH(req, { params }) {
  try {
    await requireSuperAdmin();
    
    const { id } = await params;
    const body = await req.json();

    const existing = await getUserById(id);
    if (!existing) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    let passwordUpdated = false;
    if (body.password !== undefined) {
      const rawPwd = typeof body.password === "string" ? body.password.trim() : "";
      delete body.password;
      if (rawPwd) {
        const pwdCheck = validatePassword(rawPwd);
        if (!pwdCheck.valid) {
          return new Response(
            JSON.stringify({ error: pwdCheck.errors.join("; ") || "Invalid password" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        const hashed = await hashPassword(rawPwd);
        await prisma.user.update({
          where: { id },
          data: { password: hashed },
        });
        passwordUpdated = true;
      }
    }
    
    // Don't allow changing to super_admin role through API
    if (body.role === ROLES.SUPER_ADMIN) {
      return new Response(
        JSON.stringify({ error: "Cannot assign super_admin role through API" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    // Validate role if provided
    if (body.role) {
      const validRoles = [ROLES.USER, ROLES.VIEWER, ROLES.SMM, ROLES.APPROVER];
      if (!validRoles.includes(body.role)) {
        return new Response(
          JSON.stringify({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }
    
    // Handle site link assignment
    let siteLinkUpdated = false;
    if (body.siteLink !== undefined) {
      const trimmed = typeof body.siteLink === "string" ? body.siteLink.trim() : "";
      if (trimmed) {
        await assignSiteLink(id, trimmed);
        siteLinkUpdated = true;
      }
      delete body.siteLink; // Remove from update body
    }
    
    // Handle accessible sites for viewers / SMM / Approver (multi-site roles)
    if (body.accessibleSites !== undefined) {
      const roleForSites = body.role || existing.role;
      if (
        roleForSites === ROLES.VIEWER ||
        roleForSites === ROLES.SMM ||
        roleForSites === ROLES.APPROVER
      ) {
        await assignAccessibleSites(id, body.accessibleSites);
      }
      delete body.accessibleSites; // Remove from update body
    }
    
    const updated = await updateUser(id, body);
    
    if (!updated && !passwordUpdated && !siteLinkUpdated) {
      return new Response(
        JSON.stringify({ error: "No changes made" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    const user = await getUserById(id);
    
    return new Response(
      JSON.stringify({
        message: "User updated successfully",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role || "user",
          siteLink: user.siteLink || null,
          gtmContainerId: user.gtmContainerId || null,
          facebookPageId: user.facebookPageId || null,
          instagramUserId: user.instagramUserId || null,
          accessibleSites: user.accessibleSites || [],
          isActive: user.isActive !== false,
          emailVerified: user.emailVerified || false,
          status: user.status || (user.emailVerified ? "active" : "pending"),
        },
      }),
      {
        status: 200,
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
      JSON.stringify({ error: error.message || "Failed to update user" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// DELETE /api/admin/users/[id] - Delete user (Super Admin only)
export async function DELETE(req, { params }) {
  try {
    const session = await requireSuperAdmin();
    
    const { id } = await params;
    
    // Prevent self-deletion
    if (id === session.user.id) {
      return new Response(
        JSON.stringify({ error: "Cannot delete your own account" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    const deleted = await deleteUser(id);
    
    if (!deleted) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    return new Response(
      JSON.stringify({ message: "User deleted successfully" }),
      {
        status: 200,
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
      JSON.stringify({ error: error.message || "Failed to delete user" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

