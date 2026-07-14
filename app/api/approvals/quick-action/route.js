import prisma from "../../../../lib/prisma";
import crypto from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function generateHmacToken(approvalId) {
  const secret = process.env.NEXTAUTH_SECRET || "default-secret";
  return crypto.createHmac('sha256', secret).update(String(approvalId)).digest('hex');
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const token = searchParams.get("token");
    const action = searchParams.get("action");

    if (!id || !token || !action) {
      return new NextResponse("Missing required parameters.", { status: 400 });
    }

    const expectedToken = generateHmacToken(id);
    if (token !== expectedToken) {
      return new NextResponse("Invalid or expired token.", { status: 403 });
    }

    const approval = await prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      return new NextResponse("Approval not found.", { status: 404 });
    }

    if (approval.status !== "pending") {
      return new NextResponse(
        `This post has already been processed (Current status: ${approval.status}). You can close this window.`,
        { status: 200, headers: { "Content-Type": "text/html" } }
      );
    }

    if (action === "approve") {
      await prisma.approval.update({
        where: { id },
        data: {
          status: "approved",
          lastAction: "approve",
          respondedAt: new Date(),
          awaitingAdminReview: true,
        },
      });
      return new NextResponse(
        `<html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h1>✅ Post Approved!</h1><p>You have successfully approved this content. The administrator has been notified. You can safely close this window.</p></body></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } }
      );
    } else if (action === "decline") {
      await prisma.approval.update({
        where: { id },
        data: {
          status: "declined",
          lastAction: "decline",
          respondedAt: new Date(),
          awaitingAdminReview: true,
        },
      });
      return new NextResponse(
        `<html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h1>❌ Post Rejected</h1><p>You have rejected this content. The administrator has been notified. You can safely close this window.</p></body></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } }
      );
    } else {
      return new NextResponse("Invalid action.", { status: 400 });
    }
  } catch (error) {
    return new NextResponse(`Error processing request: ${error.message}`, { status: 500 });
  }
}
