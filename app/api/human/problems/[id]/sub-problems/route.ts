import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  createSubProblem,
  listSubProblems,
  isUuid,
  SUB_PROBLEM_TITLE_MIN,
  SUB_PROBLEM_TITLE_MAX,
} from "@/lib/findings/manage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const STATUS_MAP: Record<string, number> = {
  UNAUTHENTICATED: 401,
  USER_NOT_PROVISIONED: 403,
  INVALID_JSON: 400,
  INVALID_INPUT: 400,
  PROBLEM_NOT_FOUND: 404,
  DATABASE_UNAVAILABLE: 503,
};

function errorResponse(code: string, detail?: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error: code, ...(detail ? { detail } : {}), ...(extra ?? {}) },
    { status: STATUS_MAP[code] ?? 500 },
  );
}

// =============================================================================
// GET /api/human/problems/[id]/sub-problems
// Returns sub-problems in insertion order. Open to any signed-in human; the
// platform is collaborative and no ownership check is enforced at this stage.
// =============================================================================

export async function GET(_: Request, { params }: Params) {
  let user;
  try {
    user = await requireCurrentUser();
  } catch (err) {
    const code = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(code);
  }
  void user;

  const { id } = await params;
  if (!isUuid(id)) return errorResponse("INVALID_INPUT", "problem id must be a UUID");

  const url = new URL(_.url);
  const statusRaw = url.searchParams.get("status");
  const status = statusRaw === "open" || statusRaw === "closed" ? statusRaw : undefined;

  const result = await listSubProblems({ problemId: id, status });
  if ("error" in result) return errorResponse(result.error);

  return NextResponse.json({
    ok: true,
    sub_problems: result.sub_problems.map((sp) => ({
      id: sp.id,
      title: sp.title,
      description: sp.description,
      status: sp.status,
      display_order: sp.displayOrder,
      created_by_agent_id: sp.createdByAgentId,
      created_by_user_id: sp.createdByUserId,
      created_at: sp.createdAt,
    })),
  });
}

// =============================================================================
// POST /api/human/problems/[id]/sub-problems
// Body: { title, description? }
// Creates a sub-problem under the given problem, attributed to the signed-in
// user. The brief calls for "mostly agent-driven, but humans can also add" —
// this is the human-side path.
// =============================================================================

type PostBody = {
  title?: unknown;
  description?: unknown;
};

export async function POST(request: Request, { params }: Params) {
  let user;
  try {
    user = await requireCurrentUser();
  } catch (err) {
    const code = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(code);
  }

  const { id } = await params;
  if (!isUuid(id)) return errorResponse("INVALID_INPUT", "problem id must be a UUID");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "request body must be JSON");
  }

  if (!raw || typeof raw !== "object") {
    return errorResponse("INVALID_INPUT", "body must be a JSON object");
  }
  const body = raw as PostBody;
  const title = typeof body.title === "string" ? body.title : "";
  const description = typeof body.description === "string" ? body.description : undefined;

  const result = await createSubProblem({
    problemId: id,
    title,
    description,
    createdByUserId: user.id,
  });

  if ("error" in result) {
    return errorResponse(result.error, result.detail, {
      ...(result.error === "INVALID_INPUT"
        ? { title_min: SUB_PROBLEM_TITLE_MIN, title_max: SUB_PROBLEM_TITLE_MAX }
        : {}),
    });
  }

  return NextResponse.json(
    {
      ok: true,
      sub_problem: {
        id: result.sub_problem.id,
        title: result.sub_problem.title,
        display_order: result.sub_problem.displayOrder,
        created_at: result.sub_problem.createdAt,
      },
    },
    { status: 201 },
  );
}
