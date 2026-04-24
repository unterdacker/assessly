import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternalReadUser, isAccessControlError } from "@/lib/auth/server";

export async function GET() {
  try {
    const session = await requireInternalReadUser();
    const companyId = session.companyId;
    if (!companyId) {
      return NextResponse.json({ ok: false, error: "No company context." }, { status: 403 });
    }

    const templates = await prisma.questionnaireTemplate.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        frameworkCategory: true,
        systemTemplateKey: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ ok: true, templates });
  } catch (err) {
    if (isAccessControlError(err)) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "Failed to load templates." }, { status: 500 });
  }
}
