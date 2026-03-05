import type { LinksFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData } from "react-router";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import enTranslations from "@shopify/polaris/locales/en.json";
import { verifyAppProxySignature } from "../lib/proxy.server";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const signature = url.searchParams.get("signature");

  // If request has a signature, it came through the app proxy — verify it
  if (signature) {
    const isValid = verifyAppProxySignature(url);
    if (!isValid) {
      throw new Response("Unauthorized", { status: 401 });
    }
  }

  return { shop: url.searchParams.get("shop") || "" };
};

export default function PortalLayout() {
  useLoaderData<typeof loader>();
  return (
    <PolarisAppProvider i18n={enTranslations}>
      <Outlet />
    </PolarisAppProvider>
  );
}
