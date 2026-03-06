import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { notifyNewReturn } from "../notifications.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const body = payload as {
    id?: number;
    admin_graphql_api_id?: string;
    name?: string;
    order?: { name?: string };
    customer?: { first_name?: string; last_name?: string };
    return_line_items?: Array<{
      quantity?: number;
      return_reason_note?: string;
    }>;
  };

  const returnName = body.name ?? `Return #${body.id ?? "unknown"}`;
  const orderName = body.order?.name ?? "Unknown order";
  const customerName = [body.customer?.first_name, body.customer?.last_name]
    .filter(Boolean)
    .join(" ") || undefined;
  const totalQuantity = body.return_line_items?.reduce(
    (sum, li) => sum + (li.quantity ?? 0),
    0,
  );
  const reason = body.return_line_items?.[0]?.return_reason_note ?? undefined;

  await notifyNewReturn(shop, {
    returnId: body.admin_graphql_api_id ?? `gid://shopify/Return/${body.id}`,
    returnName,
    orderName,
    customerName,
    totalQuantity,
    reason,
  });

  return new Response();
};
