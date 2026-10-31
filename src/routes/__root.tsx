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
          title: "Edu-Canvas · Lessons that land",
        },
        {
          name: "description",
          content:
            "Turn one sentence into a standards-aligned visual lesson your students understand. Teachers approve every variant; AI never grades or publishes unreviewed content.",
        },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        {
          rel: "preload",
          href: "/fonts/hanken-grotesk-variable-core.woff2",
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
