import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import prisma from "../../../lib/prisma";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const role = session.user.role;
    let whereClause = {};

    if (role !== "super_admin" && role !== "smm") {
      whereClause = {
        OR: [
          { assigneeId: session.user.id },
          { createdById: session.user.id }
        ]
      };
    }

    const approvals = await prisma.approval.findMany({
      where: whereClause,
      include: {
        assignee: { select: { id: true, name: true, email: true } }
      },
      orderBy: { scheduledFor: "asc" }
    });

    return new Response(JSON.stringify({ approvals }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Failed to load calendar data" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}