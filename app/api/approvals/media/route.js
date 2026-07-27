import prisma from "../../../../lib/prisma";
import { verifyApprovalQuickActionToken } from "../../../../lib/approvalQuickAction.js";
import { isApprovalVideoPath } from "../../../../lib/approvalMedia.js";
import { mediaViewerPage, resolvePublicMediaUrl } from "../../../../lib/emailMedia.js";
import { resultPage } from "../../../../lib/quickActionPages.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const token = searchParams.get("token");

    if (!id || !token) {
      return new Response(
        resultPage({
          title: "Missing details",
          message: "This media link is incomplete. Please use the original link from your email.",
          tone: "warn",
          kindLabel: "Attention",
        }),
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    if (!verifyApprovalQuickActionToken(id, token)) {
      return new Response(
        resultPage({
          title: "Link not valid",
          message: "This media link is invalid or has expired.",
          tone: "warn",
          kindLabel: "Attention",
        }),
        { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const approval = await prisma.approval.findUnique({
      where: { id },
      select: { id: true, title: true, imagePath: true, siteLink: true, selectedSite: true },
    });

    if (!approval?.imagePath) {
      return new Response(
        resultPage({
          title: "No media attached",
          message: "This approval request does not include an image or video file.",
          tone: "info",
          kindLabel: "Notice",
        }),
        { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const baseUrl = (process.env.NEXTAUTH_URL || new URL(req.url).origin).replace(/\/+$/, "");
    const mediaUrl = resolvePublicMediaUrl(approval.imagePath, baseUrl);
    const siteLabel = String(approval.selectedSite || approval.siteLink || "")
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");

    const html = mediaViewerPage({
      title: approval.title || "Post media",
      subtitle: siteLabel || undefined,
      mediaUrl,
      isVideo: isApprovalVideoPath(approval.imagePath),
      downloadLabel: isApprovalVideoPath(approval.imagePath) ? "Open video" : "Open full image",
    });

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return new Response(
      resultPage({
        title: "Could not load media",
        message: error.message || "Something went wrong while opening this file.",
        tone: "warn",
        kindLabel: "Attention",
      }),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
