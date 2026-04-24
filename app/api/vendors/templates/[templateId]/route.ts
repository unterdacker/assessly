import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternalReadUser, isAccessControlError } from "@/lib/auth/server";

type RouteParams = { params: Promise<{ templateId: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireInternalReadUser();
    const companyId = session.companyId;
    if (!companyId) {
      return NextResponse.json({ ok: false, error: "No company context." }, { status: 403 });
    }

    const { templateId } = await params;

    if (!/^c[a-z0-9]{20,29}$/.test(templateId)) {
      return NextResponse.json({ ok: false, error: "Template not found." }, { status: 404 });
    }

    const template = await prisma.questionnaireTemplate.findFirst({
      where: { id: templateId, companyId, isActive: true },
      select: {
        name: true,
        sections: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            title: true,
            orderIndex: true,
            questions: {
              orderBy: { orderIndex: "asc" },
              select: {
                id: true,
                text: true,
                helpText: true,
                type: true,
                isRequired: true,
                orderIndex: true,
              },
            },
          },
        },
      },
    });

    if (!template) {
      return NextResponse.json({ ok: false, error: "Template not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, template });
  } catch (err) {
    if (isAccessControlError(err)) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "Failed to load template." }, { status: 500 });
  }
}
