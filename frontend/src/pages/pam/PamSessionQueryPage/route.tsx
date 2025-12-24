import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PamSessionQueryPage } from "./PamSessionQueryPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/sessions/$sessionId/query"
)({
  component: PamSessionQueryPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Sessions",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/sessions",
            params
          })
        },
        {
          label: "Query Editor"
        }
      ]
    };
  }
});
