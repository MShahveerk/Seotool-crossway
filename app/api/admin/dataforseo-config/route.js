import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getDataForSeoCredentials, setLeaveDataForSeoCredentials } from "@/lib/dataforseo";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Super admin required" }, { status: 403 });
    }

    const creds = await getDataForSeoCredentials();
    const maskedLogin = creds.login
      ? creds.login.replace(/^(.{2}).*(@.*)$/, "$1***$2")
      : "";

    return NextResponse.json({
      configured: creds.configured,
      login: maskedLogin,
      fullLogin: creds.login,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to fetch DataForSEO config" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Super admin required" }, { status: 403 });
    }

    const body = await req.json();
    const { login, password } = body || {};

    if (!login || !password) {
      return NextResponse.json({ error: "Login and password are required" }, { status: 400 });
    }

    await setLeaveDataForSeoCredentials(login, password);

    const creds = await getDataForSeoCredentials();
    return NextResponse.json({
      success: true,
      configured: creds.configured,
      message: "DataForSEO credentials saved successfully",
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to save DataForSEO config" }, { status: 500 });
  }
}
