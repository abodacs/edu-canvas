import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

import type { ReactElement, Ref } from "react";

export interface AuthNotice {
  readonly tone: "error" | "info";
  readonly title: string;
  readonly message: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

interface AuthStatusProperties {
  readonly notice: AuthNotice | null;
  readonly noticeRef?: Ref<HTMLDivElement>;
}

/**
One announced outcome on an authentication surface. `Notice` is mounted with
its content, so a new outcome arrives as a live region instead of filling an
empty one. The host is the focus target for a server failure, which has no
control to move to; client-side validation focuses the failing field instead.
*/
export const AuthStatus = ({
  notice,
  noticeRef,
}: AuthStatusProperties): ReactElement | null => {
  if (notice === null) {
    return null;
  }

  const action = notice.onAction;

  return (
    <div ref={noticeRef} className="auth-status-host" tabIndex={-1}>
      <Notice
        tone={notice.tone === "error" ? "stop" : "info"}
        title={notice.title}
        action={
          notice.actionLabel && action ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={action}
            >
              {notice.actionLabel}
            </Button>
          ) : null
        }
      >
        <p>{notice.message}</p>
      </Notice>
    </div>
  );
};
