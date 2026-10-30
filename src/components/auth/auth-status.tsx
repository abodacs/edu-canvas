import { Button } from "@/components/ui/button";

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

const NoticeBody = ({
  notice,
}: {
  readonly notice: AuthNotice;
}): ReactElement => {
  return (
    <>
      <strong className="auth-status__title">{notice.title}</strong>
      <p>{notice.message}</p>
      {notice.actionLabel && notice.onAction ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="auth-status__action"
          onClick={() => {
            notice.onAction?.();
          }}
        >
          {notice.actionLabel}
        </Button>
      ) : null}
    </>
  );
};

/**
 * One stable host for every outcome on an authentication surface. Both regions render before their text does, so repeated messages announce reliably; the focus target is the host, which the caller can focus to move focus to the outcome.
 */
export const AuthStatus = ({
  notice,
  noticeRef,
}: AuthStatusProperties): ReactElement => {
  return (
    <div ref={noticeRef} className="auth-status-host" tabIndex={-1}>
      <div className="auth-status auth-status--error" role="alert">
        {notice?.tone === "error" ? <NoticeBody notice={notice} /> : null}
      </div>
      <output className="auth-status auth-status--info">
        {notice && notice.tone !== "error" ? (
          <NoticeBody notice={notice} />
        ) : null}
      </output>
    </div>
  );
};
