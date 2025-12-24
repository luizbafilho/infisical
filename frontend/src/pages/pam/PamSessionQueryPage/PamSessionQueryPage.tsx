import { Helmet } from "react-helmet";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useParams } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useOrganization, useProject } from "@app/context";
import { ProjectPermissionPamSessionActions } from "@app/context/ProjectPermissionContext/types";
import { useGetPamSessionById } from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";

import { SessionHeader } from "./components/SessionHeader";
import { SqlEditor } from "./components/SqlEditor";

const Page = () => {
  const sessionId = useParams({
    from: ROUTE_PATHS.Pam.PamSessionQueryPage.id,
    select: (el) => el.sessionId
  });
  const { data: session, isLoading } = useGetPamSessionById(sessionId);
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  if (isLoading) {
    return (
      <div className="mx-auto flex flex-col justify-center bg-bunker-800 text-white">
        <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
          <div className="text-center">Loading session...</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto flex flex-col justify-center bg-bunker-800 text-white">
        <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
          <div className="text-center">Session not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
        <Link
          to="/organizations/$orgId/projects/pam/$projectId/sessions"
          params={{
            orgId: currentOrg.id,
            projectId: currentProject.id
          }}
          className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
        >
          <FontAwesomeIcon icon={faChevronLeft} />
          Sessions
        </Link>
        <PageHeader
          scope={ProjectType.PAM}
          title="SQL Query Editor"
          description="Execute SQL queries against the database"
        />
        <div className="mt-4">
          <SessionHeader session={session} />
          <SqlEditor sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
};

export const PamSessionQueryPage = () => {
  return (
    <>
      <Helmet>
        <title>SQL Query Editor</title>
      </Helmet>
      <ProjectPermissionCan
        I={ProjectPermissionPamSessionActions.Read}
        a={ProjectPermissionSub.PamSessions}
        passThrough={false}
        renderGuardBanner
      >
        <Page />
      </ProjectPermissionCan>
    </>
  );
};
