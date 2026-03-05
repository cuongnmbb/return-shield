import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
        <style dangerouslySetInnerHTML={{ __html: `body.loading{opacity:0}body{transition:opacity .1s ease-in}` }} />
        <script dangerouslySetInnerHTML={{ __html: `document.addEventListener("DOMContentLoaded",function(){document.body.classList.remove("loading")})` }} />
      </head>
      <body className="loading">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
