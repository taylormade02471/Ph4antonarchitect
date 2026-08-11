import { isCronAuthorized } from "@/lib/cron-auth";
import {
  allowedMaterials,
  getPackagingVariants,
  savePackagingVariant,
  type PackagingVariantInput,
} from "@/lib/packaging/variant-options";

export async function GET(request: Request) {
  const variantId = new URL(request.url).searchParams.get("shopifyVariantId") ?? undefined;
  return Response.json({
    status: "ok",
    optionName: "Bottle Material",
    allowedMaterials,
    assignments: await getPackagingVariants(variantId),
    shopifyWrites: 0,
  });
}

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) {
      return Response.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    }
    const assignment = await savePackagingVariant(await request.json() as PackagingVariantInput);
    return Response.json({
      status: "ok",
      assignment,
      approvalRequired: true,
      shopifyWrites: 0,
    });
  } catch (error) {
    return Response.json(
      { status: "error", message: error instanceof Error ? error.message : "Packaging assignment failed" },
      { status: 400 },
    );
  }
}
