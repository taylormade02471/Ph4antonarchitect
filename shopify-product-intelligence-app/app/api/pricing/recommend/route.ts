import { recommendRetailPrice } from "@/lib/pricing/retail-price";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      supplierUnitCost?: number;
      shippingCostPerUnit?: number | null;
      otherCostPerUnit?: number | null;
    };
    if (body.supplierUnitCost === undefined) {
      return Response.json({ status: "error", message: "supplierUnitCost is required" }, { status: 400 });
    }
    return Response.json({
      status: "ok",
      recommendation: recommendRetailPrice({
        supplierUnitCost: body.supplierUnitCost,
        shippingCostPerUnit: body.shippingCostPerUnit,
        otherCostPerUnit: body.otherCostPerUnit,
      }),
      liveActionsExecuted: 0,
    });
  } catch (error) {
    return Response.json({
      status: "error",
      message: error instanceof Error ? error.message : "Pricing recommendation failed",
    }, { status: 400 });
  }
}
