import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

import appCss from "../styles.css?url";

import type { ReactNode } from "react";

const RootDocument = ({ children }: { readonly children: ReactNode }) => {
  return (
    <html lang="en" dir="ltr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
};

export const Route = createRootRoute({
  head: () => {
    return {
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1, viewport-fit=cover",
        },
        {
          title: "Scholé · Teaching, returned to its origin",
        },
        {
          name: "description",
          content:
            "Scholé takes the repetitive lesson prep off your desk, so you get your time and focus back for teaching. Teachers approve every variant; AI never grades or publishes unreviewed content.",
        },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        {
          rel: "preload",
          href: "/fonts/figtree-core.woff2",
          as: "font",
          type: "font/woff2",
          crossOrigin: "anonymous",
        },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      ],
    };
  },
  shellComponent: RootDocument,
});
